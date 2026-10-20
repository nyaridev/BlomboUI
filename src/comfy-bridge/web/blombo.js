// blombo-bridge (ADR-0009): BlomboUI's "Edit in ComfyUI" and "Save to Blombo".
//
// Opened from Blombo, ComfyUI's address carries ?blombo=<token>&blombo_api=<Blombo's origin>.
// The extension then loads that workflow's graph onto the canvas and shows a small bar:
// Save to Blombo (overwrite; Blombo keeps your values), Save as copy, Cancel. Each save sends
// both graphs from app.graphToPrompt(), so ComfyUI's own frontend does the conversion.
// Without a session, the Workflow menu gets "Send to Blombo", which adds the canvas to Blombo
// as a new workflow (Blombo's address comes from config.json, written when Blombo installed this).

import { app } from "../../scripts/app.js";
import { cleanUrl, configuredApi, createClient, readParams, toGraphs } from "./blombo-core.js";

const BAR_ID = "blombo-bridge-bar";
const here = new URL(".", import.meta.url).toString();

function toast(severity, summary, detail) {
  const manager = app.extensionManager;
  if (manager && manager.toast && typeof manager.toast.add === "function") {
    manager.toast.add({ severity, summary, detail, life: severity === "error" ? 8000 : 4500 });
    return;
  }
  // Older frontends: a plain note in the bar, or the console.
  const note = document.querySelector(`#${BAR_ID} [data-note]`);
  if (note) note.textContent = detail ? `${summary}: ${detail}` : summary;
  else console.info(`[Blombo] ${summary}${detail ? `: ${detail}` : ""}`);
}

function button(label, primary, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.style.cssText = [
    "font: inherit",
    "font-size: 12px",
    "padding: 5px 10px",
    "border-radius: 6px",
    "cursor: pointer",
    "white-space: nowrap",
    primary
      ? "background: var(--p-primary-color, #3b82f6); color: var(--p-primary-contrast-color, #fff); border: 1px solid transparent"
      : "background: transparent; color: var(--fg-color, #ddd); border: 1px solid var(--border-color, #555)",
  ].join(";");
  b.addEventListener("click", onClick);
  return b;
}

/** The floating bar shown while a Blombo workflow is open here. */
function showBar(state, client) {
  document.getElementById(BAR_ID)?.remove();
  const bar = document.createElement("div");
  bar.id = BAR_ID;
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Blombo edit session");
  bar.style.cssText = [
    "position: fixed",
    "top: 56px",
    "left: 50%",
    "transform: translateX(-50%)",
    "z-index: 10000",
    "display: flex",
    "align-items: center",
    "gap: 8px",
    "padding: 6px 8px 6px 12px",
    "border-radius: 10px",
    "font-family: system-ui, sans-serif",
    "font-size: 13px",
    "background: var(--comfy-menu-bg, #222)",
    "color: var(--fg-color, #ddd)",
    "border: 1px solid var(--border-color, #444)",
    "box-shadow: 0 6px 24px rgb(0 0 0 / 0.35)",
  ].join(";");

  const label = document.createElement("span");
  label.append("Editing ");
  const name = document.createElement("b");
  name.textContent = state.name;
  label.append(name, " from Blombo");
  const note = document.createElement("span");
  note.dataset.note = "";
  note.style.cssText = "opacity: 0.7; font-size: 12px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap";

  let busy = false;
  const run = (fn) => async () => {
    if (busy) return;
    busy = true;
    bar.style.opacity = "0.7";
    try {
      await fn();
    } catch (error) {
      toast("error", "Blombo", error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
      bar.style.opacity = "1";
    }
  };

  const save = (mode) =>
    run(async () => {
      if (!state.token) throw new Error("This edit session is closed. Open the workflow from Blombo again.");
      const graphs = toGraphs(await app.graphToPrompt());
      const result = await client.save(state.token, graphs, mode);
      state.token = result.next;
      state.name = result.name;
      name.textContent = result.name;
      note.textContent = result.message;
      toast("success", mode === "copy" ? "Saved as a copy in Blombo" : "Saved to Blombo", result.message);
    });

  bar.append(
    label,
    note,
    button("Save to Blombo", true, save("overwrite")),
    button("Save as copy", false, save("copy")),
    button("Cancel", false, run(async () => {
      if (state.token) await client.cancel(state.token).catch(() => null);
      state.token = null;
      bar.remove();
      toast("info", "Left Blombo editing", "Nothing more is sent to Blombo from this window.");
    })),
  );
  document.body.append(bar);
}

async function openSession(params) {
  const api = params.api || (await configuredApi(fetch, here));
  if (!api) throw new Error("This ComfyUI doesn't know where BlomboUI is. Open the workflow from Blombo again.");
  const client = createClient(api, fetch);
  // Drop the token from the address so a reload doesn't try to reuse it.
  history.replaceState(history.state, "", cleanUrl(location.href));
  const session = await client.session(params.token);
  await app.loadGraphData(session.graph, true, true, session.name);
  showBar({ token: params.token, name: session.name }, client);
  toast("info", "Opened from Blombo", `Edit "${session.name}", then Save to Blombo.`);
}

async function sendToBlombo() {
  const api = await configuredApi(fetch, here);
  if (!api) {
    toast("error", "Blombo", "This ComfyUI doesn't know where BlomboUI is. Install the bridge from Blombo's Settings → ComfyUI.");
    return;
  }
  try {
    const graphs = toGraphs(await app.graphToPrompt());
    const title = app.extensionManager?.workflow?.activeWorkflow?.filename;
    const result = await createClient(api, fetch).send(graphs, typeof title === "string" ? title : undefined);
    toast("success", "Sent to Blombo", result.message);
  } catch (error) {
    toast("error", "Blombo", error instanceof Error ? error.message : String(error));
  }
}

app.registerExtension({
  name: "blombo.bridge",
  commands: [
    { id: "Blombo.SendToBlombo", label: "Send to Blombo", icon: "pi pi-send", function: sendToBlombo },
  ],
  menuCommands: [{ path: ["Workflow"], commands: ["Blombo.SendToBlombo"] }],
  async setup() {
    const params = readParams(location.search);
    if (!params) return;
    try {
      await openSession(params);
    } catch (error) {
      toast("error", "Couldn't open the Blombo workflow", error instanceof Error ? error.message : String(error));
    }
  },
});
