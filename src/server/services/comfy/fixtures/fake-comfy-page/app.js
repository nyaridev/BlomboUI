// The fake ComfyUI frontend's `app` (served at /scripts/app.js): the parts of ComfyUI's app API
// that blombo-bridge uses (registerExtension, loadGraphData, graphToPrompt, extensionManager.toast,
// commands). It shows the graph as a list of node cards and has two buttons that change it, so a
// round trip through Blombo can be checked by hand or by a test driving this page.

const extensions = [];
let graph = { last_node_id: 0, last_link_id: 0, nodes: [], links: [], groups: [], version: 0.4 };
let name = "Unsaved workflow";
const fake = { loaded: null, toasts: [], sent: [] };
window.__fake = fake;

function render() {
  document.getElementById("wf").textContent = name;
  const canvas = document.getElementById("canvas");
  canvas.replaceChildren(
    ...graph.nodes.map((n) => {
      const el = document.createElement("div");
      el.className = "node";
      const h = document.createElement("h3");
      h.textContent = `#${n.id} ${n.title || n.type}`;
      const w = document.createElement("div");
      w.textContent = JSON.stringify(n.widgets_values ?? []);
      el.append(h, w);
      return el;
    }),
  );
}

function showToast(t) {
  fake.toasts.push(t);
  const el = document.createElement("div");
  el.textContent = `${t.summary}${t.detail ? ` · ${t.detail}` : ""}`;
  el.dataset.severity = t.severity;
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), t.life ?? 4000);
}

export const app = {
  extensions,
  registerExtension(ext) {
    extensions.push(ext);
  },
  async setupAll() {
    render();
    document.getElementById("edit").onclick = () => {
      const id = (graph.last_node_id ?? 0) + 1;
      graph.last_node_id = id;
      graph.nodes.push({
        id,
        type: "ImageSharpen",
        title: "$Sharpen",
        pos: [40, 40],
        size: [300, 120],
        mode: 0,
        inputs: [{ name: "image", type: "IMAGE", link: null }],
        outputs: [{ name: "IMAGE", type: "IMAGE", links: [] }],
        widgets_values: [1, 1, 0.5],
      });
      render();
    };
    document.getElementById("steps").onclick = () => {
      for (const n of graph.nodes)
        if (n.type === "KSampler" && Array.isArray(n.widgets_values))
          n.widgets_values[2] = Number(n.widgets_values[2] ?? 20) + 5;
      render();
    };
    document.getElementById("send").onclick = async () => {
      for (const ext of extensions)
        for (const c of ext.commands ?? []) if (c.id === "Blombo.SendToBlombo") await c.function();
    };
    for (const ext of extensions) await ext.setup?.(app);
  },
  async loadGraphData(data, _clean, _restoreView, workflowName) {
    graph = structuredClone(data);
    name = typeof workflowName === "string" ? workflowName : name;
    fake.loaded = { graph: data, name };
    render();
  },
  async graphToPrompt() {
    const res = await fetch("/fake/convert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(graph),
    });
    const output = await res.json();
    return { workflow: structuredClone(graph), output };
  },
  extensionManager: {
    toast: { add: showToast },
    workflow: { activeWorkflow: { filename: name } },
  },
};
