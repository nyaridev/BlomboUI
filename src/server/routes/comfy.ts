import { Hono } from "hono";
import { ComfyFileRef, FreeMemoryBody } from "../../shared/comfy.ts";
import { MODEL_KINDS, type ModelKind } from "../../shared/constants.ts";
import { InstallBody, type SlotsResponse } from "../../shared/install.ts";
import { HttpError, readJson } from "../lib/http.ts";
import type { ComfyInstaller } from "../services/comfy/installer.ts";
import { listSlots } from "../services/comfy/slots.ts";
import type { ComfySupervisor } from "../services/comfy/supervisor.ts";

function requireApi(supervisor: ComfySupervisor) {
  const api = supervisor.api;
  if (!api)
    throw new HttpError(
      409,
      "ComfyUI isn't running. Start it from the status menu in the header.",
      "comfy_down",
    );
  return api;
}

export function comfyRoutes(
  supervisor: ComfySupervisor,
  installer: ComfyInstaller,
  runtimeDir: string,
) {
  const r = new Hono();

  /** Installed managed slots and the installer's state. */
  r.get("/slots", async (c) => {
    const body: SlotsResponse = { slots: await listSlots(runtimeDir), install: installer.state() };
    return c.json(body);
  });

  r.post("/install", async (c) => {
    const body = await readJson(c, InstallBody);
    await installer.start(body);
    return c.json(installer.state(), 202);
  });

  r.post("/install/cancel", (c) => {
    installer.cancel();
    return c.json(installer.state());
  });

  r.get("/", (c) => c.json(supervisor.status()));
  r.post("/start", async (c) => c.json(await supervisor.start()));
  r.post("/stop", async (c) => {
    if (supervisor.status().mode === "external")
      throw new HttpError(
        400,
        "Blombo can't stop a ComfyUI it didn't start. Stop it where it runs.",
        "external",
      );
    return c.json(await supervisor.stop());
  });
  r.post("/restart", async (c) => c.json(await supervisor.restart()));
  r.get("/logs", (c) => c.json({ lines: supervisor.logs() }));

  r.post("/free", async (c) => {
    const body = await readJson(c, FreeMemoryBody);
    await requireApi(supervisor).free(body.unloadModels, body.freeMemory);
    return c.json({ ok: true });
  });

  /** Forget cached node and model lists (after adding models or custom nodes). */
  r.post("/refresh", (c) => {
    supervisor.refreshObjectInfo();
    return c.json({ ok: true });
  });

  r.get("/models/:kind", async (c) => {
    const kind = c.req.param("kind");
    if (!(MODEL_KINDS as readonly string[]).includes(kind))
      throw new HttpError(400, `Unknown model kind "${kind}".`, "bad_kind");
    const api = supervisor.api;
    if (!api) return c.json({ kind: kind as ModelKind, names: [], available: false });
    const names = await api.request<string[]>("GET", `/models/${kind}`).catch(() => []);
    return c.json({
      kind: kind as ModelKind,
      names: Array.isArray(names) ? names : [],
      available: true,
    });
  });

  /** ComfyUI images through Blombo, so pages never need ComfyUI's origin. */
  r.get("/view", async (c) => {
    const parsed = ComfyFileRef.safeParse({
      filename: c.req.query("filename"),
      subfolder: c.req.query("subfolder") ?? "",
      type: c.req.query("type") ?? "output",
    });
    if (!parsed.success) throw new HttpError(400, "Missing or invalid image reference.", "bad_ref");
    const ref = parsed.data;
    if (/[\\/]|\.\./.test(ref.filename) || /\.\./.test(ref.subfolder))
      throw new HttpError(400, "Invalid image path.", "bad_ref");
    const q = new URLSearchParams({
      filename: ref.filename,
      subfolder: ref.subfolder,
      type: ref.type,
    });
    const res = await requireApi(supervisor).fetchRaw(`/view?${q.toString()}`);
    if (!res.ok || !res.body)
      throw new HttpError(404, "ComfyUI doesn't have that image anymore.", "image_missing");
    return new Response(res.body, {
      headers: {
        "content-type": res.headers.get("content-type") ?? "image/png",
        "cache-control": ref.type === "output" ? "private, max-age=86400" : "no-cache",
      },
    });
  });

  return r;
}
