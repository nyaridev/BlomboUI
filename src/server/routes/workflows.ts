import { Hono } from "hono";
import { APP_NAME } from "../../shared/constants.ts";
import {
  DuplicateWorkflowBody,
  PatchValuesBody,
  UpdateWorkflowBody,
  type WorkflowDetail,
  type WorkflowManifest,
} from "../../shared/workflow/manifest.ts";
import type { ServerConfig } from "../config.ts";
import { HttpError, readJson } from "../lib/http.ts";
import type { BridgeService } from "../services/bridge.ts";
import type { ComfySupervisor } from "../services/comfy/supervisor.ts";
import type { LayoutService } from "../services/layouts.ts";
import { refreshBindings } from "../services/workflows/analyze.ts";
import { exportBundle } from "../services/workflows/bundle.ts";
import { importWorkflow } from "../services/workflows/import.ts";
import { installPreset, presetSummaries } from "../services/workflows/presets.ts";
import type { WorkflowService } from "../services/workflows/store.ts";

const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

export function workflowRoutes(
  config: ServerConfig,
  workflows: WorkflowService,
  supervisor: ComfySupervisor,
  layouts: LayoutService,
  bridge: BridgeService,
) {
  const r = new Hono();

  /** The manifest with choices refreshed from ComfyUI (models added since it was saved). */
  const withLiveChoices = async (m: WorkflowManifest): Promise<WorkflowManifest> => {
    const info = await supervisor.objectInfo();
    if (!info) return m;
    return { ...m, bindings: refreshBindings(m.bindings, await workflows.prompt(m.id), info) };
  };

  r.get("/", async (c) => c.json(await workflows.list()));

  r.get("/presets", async (c) => c.json(await presetSummaries(config.presetsDir, workflows)));

  r.post("/presets/:preset/install", async (c) => {
    const manifest = await installPreset(config.presetsDir, workflows, c.req.param("preset"));
    return c.json(await withLiveChoices(manifest), 201);
  });

  /** Raw file body; the name comes from ?filename= (and an optional ?name=). */
  r.post("/import", async (c) => {
    const data = new Uint8Array(await c.req.arrayBuffer());
    if (data.byteLength === 0) throw new HttpError(400, "The file is empty.", "empty");
    if (data.byteLength > MAX_IMPORT_BYTES)
      throw new HttpError(413, "That file is too large to be a workflow (64 MB max).", "too_large");
    const result = await importWorkflow(
      {
        bytes: data,
        filename: c.req.query("filename") ?? "workflow.json",
        name: c.req.query("name"),
      },
      workflows,
      await supervisor.objectInfo(),
      layouts,
    );
    return c.json(result, 201);
  });

  /** What Generate loads: live choices plus the layout it shows (linked or the default). */
  r.get("/:id", async (c) => {
    const manifest = await withLiveChoices(await workflows.get(c.req.param("id")));
    const layout = await layouts.resolve(manifest.layout);
    const detail: WorkflowDetail = {
      ...manifest,
      layoutDoc: layout.doc,
      layoutSource: layout.source,
    };
    return c.json(detail);
  });

  /** A .blombo bundle of the workflow (download). */
  r.get("/:id/export", async (c) => {
    const out = await exportBundle(c.req.param("id"), {
      workflows,
      layouts,
      app: { name: APP_NAME, version: config.version },
    });
    return new Response(out.bytes as Uint8Array<ArrayBuffer>, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${out.name.replace(/[^ -~]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(out.name)}`,
        "cache-control": "no-store",
      },
    });
  });

  /** Edit in ComfyUI: a single-use token and the ComfyUI address that opens it (ADR-0009). */
  r.post("/:id/edit-session", async (c) =>
    c.json(await bridge.createSession(c.req.param("id")), 201),
  );

  r.patch("/:id/values", async (c) => {
    const body = await readJson(c, PatchValuesBody);
    return c.json(await workflows.patchValues(c.req.param("id"), body));
  });

  r.patch("/:id", async (c) => {
    const body = await readJson(c, UpdateWorkflowBody);
    return c.json(await workflows.update(c.req.param("id"), body));
  });

  r.post("/:id/duplicate", async (c) => {
    const body = await readJson(c, DuplicateWorkflowBody);
    return c.json(await workflows.duplicate(c.req.param("id"), body.name), 201);
  });

  r.delete("/:id", async (c) => {
    await workflows.remove(c.req.param("id"));
    return c.body(null, 204);
  });

  return r;
}
