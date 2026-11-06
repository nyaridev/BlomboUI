/**
 * The workflow check's service (ADR-0018): gathers what `workflows/health.ts` needs (the graphs,
 * object_info, Blombo's pinned packs, ComfyUI-Manager's node map and model catalog) and carries
 * out its fixes. Every fix works the check out again on the server and acts only on what it
 * found: the page names a pack or a file, never a download address. The one exception is a
 * repository the user types for classes no list knows, which the page confirms first.
 */
import { UiGraph } from "../../shared/workflow/graph.ts";
import type {
  HealthInstallBody,
  MissingModel,
  WorkflowHealth,
} from "../../shared/workflow/health.ts";
import type { WorkflowManifest } from "../../shared/workflow/manifest.ts";
import type { NodePack } from "../../shared/workflow/packs.ts";
import { HttpError } from "../lib/http.ts";
import type { NodePackInstaller } from "./comfy/nodepacks.ts";
import type { ComfySupervisor } from "./comfy/supervisor.ts";
import type { DownloadQueue } from "./downloads.ts";
import type { ManagerCatalog } from "./manager.ts";
import type { NodeMap } from "./nodemap.ts";
import { uiToApi } from "./workflows/convert.ts";
import { type CatalogFile, checkHealth } from "./workflows/health.ts";
import { resync } from "./workflows/resync.ts";
import type { WorkflowService } from "./workflows/store.ts";

export interface WorkflowCheckDeps {
  workflows: WorkflowService;
  supervisor: ComfySupervisor;
  installer: NodePackInstaller;
  downloads: DownloadQueue;
  catalog: ManagerCatalog;
  nodeMap: NodeMap;
  known: () => Promise<NodePack[]>;
  /** The Hugging Face origin (the fake one in checks); huggingface.co is always allowed. */
  huggingface: string | null;
}

const AGAIN = "Check the workflow again: what it needs has changed.";
const DOWN =
  "ComfyUI isn't running, so Blombo can't check the workflow. Start ComfyUI, then try again.";

export class WorkflowCheck {
  private readonly deps: WorkflowCheckDeps;

  constructor(deps: WorkflowCheckDeps) {
    this.deps = deps;
  }

  /** `values` go over the saved ones, so the models you picked are what's checked. */
  async check(id: string, values: Record<string, unknown> = {}): Promise<WorkflowHealth> {
    const { workflows, supervisor } = this.deps;
    const manifest = await workflows.get(id);
    const info = await supervisor.objectInfo();
    if (!info) return { checked: false, packs: [], unknownNodes: [], models: [], rebuild: false };
    const hf = this.deps.huggingface ? new URL(this.deps.huggingface).origin : null;
    // The catalog needs the network (or yesterday's copy) and a profile: without it, no offers.
    const catalog: CatalogFile[] = await this.deps.catalog
      .catalog()
      .then((c) => c.entries)
      .catch(() => []);
    const prompt = structuredClone(await workflows.prompt(id));
    const current = { ...manifest.values, ...values };
    for (const b of manifest.bindings) {
      const v = current[b.id];
      const node = prompt[b.node];
      if (node && b.type !== "loras" && (typeof v === "string" || typeof v === "number"))
        node.inputs[b.input] = v;
    }
    return checkHealth({
      prompt,
      graph: await workflows.graph(id),
      info,
      known: await this.deps.known(),
      nodeMap: await this.deps.nodeMap.entries(),
      catalog,
      linkAllowed: (u) =>
        (u.protocol === "https:" && u.host === "huggingface.co") || u.origin === hf,
    });
  }

  /** Install the packs the check found, plus a repository the user named for unknown classes. */
  async install(id: string, body: HealthInstallBody): Promise<void> {
    const h = await this.check(id);
    if (!h.checked) throw new HttpError(409, DOWN, "comfy_down");
    const confirmed: NodePack[] = [];
    for (const url of body.packs ?? []) {
      const pack = h.packs.find((p) => p.url === url);
      if (!pack) throw new HttpError(409, AGAIN, "changed");
      const { source: _s, ...rest } = pack;
      confirmed.push(rest);
    }
    if (body.repo) {
      const stray = body.repo.nodes.filter((n) => !h.unknownNodes.includes(n));
      if (stray.length) throw new HttpError(409, AGAIN, "changed");
      const name = body.repo.url.split("/").pop() ?? body.repo.url;
      confirmed.push({ name, url: body.repo.url, nodes: body.repo.nodes });
    }
    if (!confirmed.length) throw new HttpError(400, "Pick the custom nodes to install.", "none");
    await this.deps.installer.start(
      confirmed.map((p) => p.url),
      confirmed,
    );
  }

  /** Queue the download the check offers for one of the workflow's missing files. */
  async download(id: string, file: string): Promise<void> {
    const h = await this.check(id);
    if (!h.checked) throw new HttpError(409, DOWN, "comfy_down");
    const m: MissingModel | undefined = h.models.find((x) => x.file === file);
    if (!m?.download) throw new HttpError(409, AGAIN, "changed");
    if (m.download.source === "manager")
      await this.deps.downloads.enqueue({ source: "manager", entryId: m.download.entryId });
    else if (m.kind) {
      const name = decodeURIComponent(new URL(m.download.url).pathname).split("/").pop() ?? "";
      await this.deps.downloads.enqueue({
        source: "url",
        url: m.download.url,
        file: name,
        kind: m.kind,
      });
    }
  }

  /**
   * Convert the canvas again now that ComfyUI knows its nodes, keeping the values like a save
   * from ComfyUI does (the old files go to the profile's trash first, `replaceGraphs`).
   */
  async rebuild(id: string): Promise<WorkflowManifest> {
    const { workflows, supervisor } = this.deps;
    const h = await this.check(id);
    if (!h.checked) throw new HttpError(409, DOWN, "comfy_down");
    if (!h.rebuild) throw new HttpError(409, AGAIN, "changed");
    const info = await supervisor.objectInfo();
    const graph = UiGraph.safeParse(await workflows.graph(id));
    if (!info || !graph.success) throw new HttpError(409, AGAIN, "changed");
    const current = await workflows.get(id);
    const { prompt } = uiToApi(graph.data, info);
    const r = resync(current, await workflows.prompt(id), prompt, info);
    return workflows.replaceGraphs(id, {
      prompt,
      graph: graph.data,
      bindings: r.bindings,
      values: r.values,
      kind: r.kind,
    });
  }
}
