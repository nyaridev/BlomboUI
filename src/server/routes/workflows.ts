import { Hono } from "hono";
import { APP_NAME } from "../../shared/constants.ts";
import {
  HealthCheckBody,
  HealthDownloadBody,
  HealthInstallBody,
} from "../../shared/workflow/health.ts";
import {
  DuplicateWorkflowBody,
  PatchValuesBody,
  UpdateWorkflowBody,
  type WorkflowDetail,
  type WorkflowManifest,
} from "../../shared/workflow/manifest.ts";
import type { ServerConfig } from "../config.ts";
import { HttpError, readBody, readJson } from "../lib/http.ts";
import { IMMUTABLE, sendFile } from "../lib/send.ts";
import type { BridgeService } from "../services/bridge.ts";
import type { ComfySupervisor } from "../services/comfy/supervisor.ts";
import type { LayoutService } from "../services/layouts.ts";
import type { StageService } from "../services/stages.ts";
import type { WorkflowCheck } from "../services/workflowcheck.ts";
import { outputRoles, refreshBindings } from "../services/workflows/analyze.ts";
import { exportBundle } from "../services/workflows/bundle.ts";
import { importWorkflow } from "../services/workflows/import.ts";
import { installPreset, presetSummaries } from "../services/workflows/presets.ts";
import { sourceModes } from "../services/workflows/stages.ts";
import type { WorkflowService } from "../services/workflows/store.ts";

const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

export function workflowRoutes(
  config: ServerConfig,
  workflows: WorkflowService,
  supervisor: ComfySupervisor,
  layouts: LayoutService,
  bridge: BridgeService,
  check: WorkflowCheck,
  stages: StageService,
) {
  const r = new Hono();

  /* The workflow check (ADR-0018): what it needs that ComfyUI doesn't have, and the fixes. */
  r.post("/:id/health", async (c) => {
    const { values } = await readJson(c, HealthCheckBody);
    return c.json(await check.check(c.req.param("id"), values));
  });
  r.post("/:id/health/install", async (c) => {
    await check.install(c.req.param("id"), await readJson(c, HealthInstallBody));
    return c.json({ ok: true }, 202);
  });
  r.post("/:id/health/download", async (c) => {
    const { file } = await readJson(c, HealthDownloadBody);
    await check.download(c.req.param("id"), file);
    return c.json({ ok: true }, 202);
  });
  r.post("/:id/health/rebuild", async (c) => c.json(await check.rebuild(c.req.param("id"))));

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
    const data = await readBody(
      c,
      MAX_IMPORT_BYTES,
      "That file is too large to be a workflow (64 MB max).",
    );
    if (data.byteLength === 0) throw new HttpError(400, "The file is empty.", "empty");
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
    const prompt = await workflows.prompt(manifest.id);
    const media = outputRoles(prompt, await supervisor.objectInfo()).has("output.video")
      ? "video"
      : "image";
    const detail: WorkflowDetail = {
      ...manifest,
      layoutDoc: layout.doc,
      layoutSource: layout.source,
      media,
      sourceModes: sourceModes(prompt, await stages.packages(), manifest.bindings, media),
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

  /** The preview picture: GET serves it, an image in a PUT body replaces it, DELETE clears it. */
  r.get("/:id/thumb", async (c) =>
    sendFile(await workflows.thumbFile(c.req.param("id")), {
      cache: c.req.query("v") ? IMMUTABLE : "no-cache",
    }),
  );
  r.put("/:id/thumb", async (c) => {
    const bytes = await readBody(c, 64 * 1024 * 1024, "Pick an image under 64 MB.");
    if (bytes.byteLength === 0) throw new HttpError(400, "The image is empty.", "empty");
    await workflows.setThumb(c.req.param("id"), bytes);
    return c.json({ ok: true });
  });
  r.delete("/:id/thumb", async (c) => {
    await workflows.removeThumb(c.req.param("id"));
    return c.json({ ok: true });
  });

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
