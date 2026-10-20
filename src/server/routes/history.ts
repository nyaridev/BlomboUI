import { Hono } from "hono";
import { z } from "zod";
import { ModelFavoriteBody, SaveSnippetBody } from "../../shared/history.ts";
import { HttpError, readJson } from "../lib/http.ts";
import type { GalleryService } from "../services/gallery/index.ts";
import type { HistoryService } from "../services/history.ts";
import type { JobQueue } from "../services/jobs.ts";
import type { SnippetService } from "../services/snippets.ts";
import type { WorkflowService } from "../services/workflows/store.ts";

/** The job log (Generations, re-run, prompt history, usage stats), the error log, snippets. */
export function historyRoutes(deps: {
  history: HistoryService;
  queue: JobQueue;
  workflows: WorkflowService;
  gallery: GalleryService;
  snippets: SnippetService;
}) {
  const { history, queue, workflows, gallery, snippets } = deps;
  const r = new Hono();

  r.get("/jobs", (c) => c.json(history.list(c.req.query())));

  r.get("/jobs/:id", (c) => c.json(history.detail(c.req.param("id"))));

  r.post("/jobs/:id/rerun", async (c) => {
    const body = await readJson(c, z.object({ newSeed: z.boolean().default(false) }));
    const run = history.detail(c.req.param("id"));
    const manifest = await workflows.get(run.workflowId).catch(() => {
      throw new HttpError(
        404,
        `"${run.workflowName}" isn't in this profile anymore, so this run can't be repeated.`,
        "no_workflow",
      );
    });
    const job = queue.rerun(manifest, run.values, run.stages, body.newSeed ? null : run.seed);
    return c.json({ job }, 201);
  });

  r.post("/jobs/remove", async (c) => {
    const body = await readJson(
      c,
      z.object({
        ids: z.array(z.string()).min(1).max(5000).optional(),
        all: z.boolean().optional(),
      }),
    );
    if (!body.ids && !body.all) throw new HttpError(400, "Which runs? Pass ids or all.", "no_ids");
    return c.json({ removed: history.remove(body.all ? "all" : (body.ids ?? [])) });
  });

  r.get("/prompts", (c) => {
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
    return c.json(history.prompts((c.req.query("q") ?? "").trim().slice(0, 200), limit));
  });

  r.get("/model-marks", (c) => c.json(history.modelMarks()));

  r.post("/model-marks", async (c) => {
    const body = await readJson(c, ModelFavoriteBody);
    return c.json(history.setModelFavorite(body.kind, body.name, body.favorite));
  });

  r.get("/stats", async (c) => {
    const overview = await gallery.overview();
    return c.json(
      history.stats({ images: overview.counts.all, favorites: overview.counts.favorites }),
    );
  });

  r.get("/errors", (c) => c.json(history.errors()));

  r.post("/errors/clear", async (c) => {
    const body = await readJson(c, z.object({ ids: z.array(z.string()).max(500).optional() }));
    return c.json({ removed: history.clearErrors(body.ids) });
  });

  r.get("/snippets", async (c) => c.json(await snippets.list()));

  r.post("/snippets", async (c) => c.json(await snippets.save(await readJson(c, SaveSnippetBody))));

  r.delete("/snippets/:id", async (c) => {
    await snippets.remove(c.req.param("id"));
    return c.body(null, 204);
  });

  return r;
}
