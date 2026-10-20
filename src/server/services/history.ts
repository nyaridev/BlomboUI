/**
 * The job log and the error log, both in the profile database (ADR-0006).
 *
 *  - Every run that leaves the queue (done, failed, interrupted; not cancelled before it ran)
 *    becomes a row with the values and stages it ran with, how long each part took, and what
 *    it used (model, LoRAs from <lora:…> tags, wildcards), so History can run it again and
 *    Settings → Overview can count it. The newest MAX_ROWS rows are kept.
 *  - Errors the bus announces are kept too, so the Errors view survives a reload.
 *
 * The log is written from the queue's `finished` event (wired in context.ts); nothing here
 * talks to ComfyUI.
 */
import type {
  JobHistoryPage,
  JobHistoryQueryInput,
  JobKind,
  JobRecord,
  JobRecordDetail,
  ModelMarks,
  PromptHistoryEntry,
  Usage,
  UsageStats,
} from "../../shared/history.ts";
import { JobHistoryQuery } from "../../shared/history.ts";
import type { Job, JobTiming } from "../../shared/jobs.ts";
import type { AppError } from "../../shared/live.ts";
import { findLoraTags } from "../../shared/prompt/loras.ts";
import { findWildcards } from "../../shared/prompt/wildcards.ts";
import { bindingFor, type WorkflowManifest } from "../../shared/workflow/manifest.ts";
import { type ProfileDbs, transaction } from "../db/profileDb.ts";
import { HttpError } from "../lib/http.ts";
import type { GalleryService } from "./gallery/index.ts";
import type { RunContext } from "./jobs.ts";
import type { ProfileService } from "./profiles.ts";

const MAX_ROWS = 20_000;
const MAX_ERRORS = 500;
const DAY_MS = 24 * 3600 * 1000;

export interface HistoryDeps {
  profiles: ProfileService;
  dbs: ProfileDbs;
  gallery: GalleryService;
}

interface LogRow {
  id: string;
  workflow_id: string;
  workflow_name: string;
  kind: string;
  state: string;
  seed: number | null;
  width: number | null;
  height: number | null;
  images: number;
  created_at: number;
  started_at: number | null;
  finished_at: number;
  duration_ms: number | null;
  model: string | null;
  prompt: string | null;
  negative: string | null;
  values_json: string;
  stages_json: string | null;
  timings: string;
  error: string | null;
  group_title: string | null;
  first_image: string | null;
}

/** What a run used, from the values it ran with (pure; tested). */
export function usesOf(
  manifest: WorkflowManifest,
  values: Record<string, unknown>,
): {
  model: string | null;
  prompt: string | null;
  negative: string | null;
  loras: string[];
  wildcards: string[];
} {
  const text = (role: string) => {
    const b = bindingFor(manifest.bindings, role);
    const v = b ? values[b.id] : undefined;
    return typeof v === "string" ? v : null;
  };
  const model = text("model.checkpoint") ?? text("model.unet");
  const prompts = manifest.bindings
    .filter((b) => b.type === "prompt")
    .map((b) => values[b.id])
    .filter((v): v is string => typeof v === "string");
  const loras = [...new Set(prompts.flatMap((p) => findLoraTags(p).map((t) => t.name)))];
  const wildcards = [...new Set(prompts.flatMap((p) => findWildcards(p)))];
  return {
    model,
    prompt: text("prompt.positive"),
    negative: text("prompt.negative"),
    loras,
    wildcards,
  };
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) : null);

function safeJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Local midnight `days` days before today. */
function dayStart(days: number, now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.getTime();
}

export class HistoryService {
  private readonly deps: HistoryDeps;

  constructor(deps: HistoryDeps) {
    this.deps = deps;
  }

  private db() {
    const id = this.deps.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return this.deps.dbs.get(id).db;
  }

  /* ── writing ──────────────────────────────────────────────────────────── */

  /** Log a run that left the queue. Runs cancelled before they started aren't worth a row. */
  record(job: Job, context: RunContext | null): void {
    // A run that ends after a profile switch belongs to the profile it was queued in.
    if (!context?.profileId || context.profileId !== this.deps.profiles.active) return;
    if (job.state === "cancelled" && !job.startedAt) return;
    if (job.state === "queued" || job.state === "running") return;
    const uses = usesOf(context.manifest, context.values);
    const started = ms(job.startedAt);
    const finished = ms(job.finishedAt) ?? Date.now();
    const kind: JobKind = job.group?.kind ?? "generate";
    const db = this.db();
    transaction(db, () => {
      db.prepare(
        `INSERT OR REPLACE INTO job_log (id, workflow_id, workflow_name, kind, state, seed, width,
           height, images, created_at, started_at, finished_at, duration_ms, model, prompt,
           negative, values_json, stages_json, timings, error, group_title, first_image)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        job.id,
        job.workflowId,
        job.workflowName,
        kind,
        job.state,
        job.seed,
        job.width,
        job.height,
        job.images.filter((i) => i.type === "output").length || job.images.length,
        ms(job.createdAt) ?? finished,
        started,
        finished,
        started !== null ? Math.max(0, finished - started) : null,
        uses.model,
        uses.prompt,
        uses.negative,
        JSON.stringify(context.values),
        context.stages ? JSON.stringify(context.stages) : null,
        JSON.stringify(job.timings),
        job.error,
        job.group?.title ?? null,
        job.images[0]
          ? JSON.stringify(job.images.find((i) => i.type === "output") ?? job.images[0])
          : null,
      );
      const use = db.prepare("INSERT INTO job_log_uses (job_id, kind, name) VALUES (?, ?, ?)");
      if (uses.model) use.run(job.id, "model", uses.model);
      for (const l of uses.loras) use.run(job.id, "lora", l);
      for (const w of uses.wildcards) use.run(job.id, "wildcard", w);
    });
    this.prune();
  }

  private pruneCounter = 0;
  private prune(): void {
    // Checking every 200 rows is plenty for a cap of 20 000.
    if (++this.pruneCounter % 200 !== 0) return;
    const db = this.db();
    db.prepare(
      `DELETE FROM job_log WHERE id IN (
         SELECT id FROM job_log ORDER BY finished_at DESC LIMIT -1 OFFSET ?)`,
    ).run(MAX_ROWS);
  }

  /* ── reading ──────────────────────────────────────────────────────────── */

  private toRecords(rows: LogRow[]): JobRecord[] {
    const refs = rows.flatMap((r) => {
      const ref = safeJson<{ filename: string; subfolder: string; type: string } | null>(
        r.first_image,
        null,
      );
      return ref ? [ref] : [];
    });
    const found = this.deps.gallery.findOutputs(refs);
    const usesFor = this.db().prepare("SELECT kind, name FROM job_log_uses WHERE job_id = ?");
    return rows.map((r) => {
      const ref = safeJson<{ filename: string; subfolder: string } | null>(r.first_image, null);
      const image = ref
        ? found.get([ref.subfolder, ref.filename].filter(Boolean).join("/").replace(/\\/g, "/"))
        : undefined;
      const uses = usesFor.all(r.id) as Array<{ kind: string; name: string }>;
      return {
        id: r.id,
        workflowId: r.workflow_id,
        workflowName: r.workflow_name,
        kind: r.kind as JobKind,
        state: r.state as JobRecord["state"],
        seed: r.seed === null ? null : Number(r.seed),
        width: r.width === null ? null : Number(r.width),
        height: r.height === null ? null : Number(r.height),
        images: Number(r.images),
        createdAt: Number(r.created_at),
        startedAt: r.started_at === null ? null : Number(r.started_at),
        finishedAt: Number(r.finished_at),
        durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
        model: r.model,
        loras: uses.filter((u) => u.kind === "lora").map((u) => u.name),
        wildcards: uses.filter((u) => u.kind === "wildcard").map((u) => u.name),
        prompt: r.prompt,
        negative: r.negative,
        timings: safeJson<JobTiming[]>(r.timings, []),
        error: r.error,
        groupTitle: r.group_title,
        thumb: image?.thumb ?? null,
        imageId: image?.id ?? null,
      };
    });
  }

  list(input: JobHistoryQueryInput): JobHistoryPage {
    const q = JobHistoryQuery.parse(input);
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (q.workflowId) {
      where.push("workflow_id = ?");
      params.push(q.workflowId);
    }
    if (q.state === "done") where.push("state = 'done'");
    if (q.state === "failed") where.push("state IN ('error', 'interrupted')");
    for (const term of q.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)) {
      where.push(
        "(LOWER(COALESCE(prompt, '')) LIKE ? ESCAPE '\\' OR LOWER(workflow_name) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(model, '')) LIKE ? ESCAPE '\\')",
      );
      const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      params.push(like, like, like);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const db = this.db();
    const rows = db
      .prepare(`SELECT * FROM job_log ${clause} ORDER BY finished_at DESC LIMIT ? OFFSET ?`)
      .all(...params, q.limit, q.offset) as unknown as LogRow[];
    const total = db.prepare(`SELECT COUNT(*) AS n FROM job_log ${clause}`).get(...params) as {
      n: number;
    };
    return { items: this.toRecords(rows), total: Number(total.n), offset: q.offset };
  }

  detail(id: string): JobRecordDetail {
    const row = this.db().prepare("SELECT * FROM job_log WHERE id = ?").get(id) as
      | LogRow
      | undefined;
    if (!row) throw new HttpError(404, "That run isn't in the history anymore.", "no_run");
    const [record] = this.toRecords([row]);
    return {
      ...(record as JobRecord),
      values: safeJson<Record<string, unknown>>(row.values_json, {}),
      stages: safeJson(row.stages_json, null),
    };
  }

  /** Remove runs from the log (the images stay where they are). */
  remove(ids: string[] | "all"): number {
    const db = this.db();
    if (ids === "all") return Number(db.prepare("DELETE FROM job_log").run().changes);
    let n = 0;
    const del = db.prepare("DELETE FROM job_log WHERE id = ?");
    transaction(db, () => {
      for (const id of ids) n += Number(del.run(id).changes);
    });
    return n;
  }

  /** Recent distinct positive prompts, newest first, optionally filtered. */
  prompts(query: string, limit: number): PromptHistoryEntry[] {
    const like = `%${query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = this.db()
      .prepare(
        `SELECT prompt AS text, COUNT(*) AS uses, MAX(finished_at) AS last
         FROM job_log WHERE prompt IS NOT NULL AND TRIM(prompt) <> ''
           AND LOWER(prompt) LIKE ? ESCAPE '\\'
         GROUP BY prompt ORDER BY last DESC LIMIT ?`,
      )
      .all(like, limit) as Array<{ text: string; uses: number; last: number }>;
    return rows.map((r) => ({ text: r.text, uses: Number(r.uses), lastUsed: Number(r.last) }));
  }

  /** Models used most recently ("checkpoints" names as ComfyUI lists them), newest first. */
  recentModels(limit = 30): string[] {
    const rows = this.db()
      .prepare(
        `SELECT u.name AS name, MAX(j.finished_at) AS last FROM job_log_uses u
         JOIN job_log j ON j.id = u.job_id WHERE u.kind IN ('model', 'lora')
         GROUP BY u.kind, u.name ORDER BY last DESC LIMIT ?`,
      )
      .all(limit) as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  stats(gallery: UsageStats["gallery"]): UsageStats {
    const db = this.db();
    const one = (sql: string, ...args: Array<string | number>) =>
      Number((db.prepare(sql).get(...args) as { n: number | null }).n ?? 0);
    const week = dayStart(6);
    const today = dayStart(0);
    const done = "state = 'done'";
    const perDay = Array.from({ length: 14 }, (_, i) => {
      const start = dayStart(13 - i);
      const end = start + DAY_MS + 2 * 3600 * 1000; // DST-safe: clipped by the next start
      const next = i === 13 ? Number.MAX_SAFE_INTEGER : dayStart(12 - i);
      const d = new Date(start);
      const pad = (n: number) => String(n).padStart(2, "0");
      return {
        day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        count: one(
          `SELECT SUM(images) AS n FROM job_log WHERE ${done} AND finished_at >= ? AND finished_at < ?`,
          start,
          Math.min(end, next),
        ),
      };
    });
    const top = (kind: string): Usage[] =>
      (
        db
          .prepare(
            `SELECT u.name AS name, COUNT(*) AS count FROM job_log_uses u
             JOIN job_log j ON j.id = u.job_id WHERE u.kind = ? AND j.state = 'done'
             GROUP BY u.name ORDER BY count DESC, u.name LIMIT 8`,
          )
          .all(kind) as Array<{ name: string; count: number }>
      ).map((r) => ({ name: r.name, count: Number(r.count) }));
    const workflows = (
      db
        .prepare(
          `SELECT workflow_name AS name, COUNT(*) AS count FROM job_log WHERE ${done}
           GROUP BY workflow_id ORDER BY count DESC LIMIT 8`,
        )
        .all() as Array<{ name: string; count: number }>
    ).map((r) => ({ name: r.name, count: Number(r.count) }));
    // Average speed this week from the finished runs' sampler timings.
    const timingRows = db
      .prepare(`SELECT timings FROM job_log WHERE ${done} AND finished_at >= ? LIMIT 2000`)
      .all(week) as Array<{ timings: string }>;
    let steps = 0;
    let stepMs = 0;
    for (const r of timingRows)
      for (const t of safeJson<JobTiming[]>(r.timings, []))
        if (t.steps > 0 && t.ms > 0) {
          steps += t.steps;
          stepMs += t.ms;
        }
    const first = db.prepare("SELECT MIN(finished_at) AS n FROM job_log").get() as {
      n: number | null;
    };
    return {
      generated: {
        total: one(`SELECT SUM(images) AS n FROM job_log WHERE ${done}`),
        week: one(`SELECT SUM(images) AS n FROM job_log WHERE ${done} AND finished_at >= ?`, week),
        today: one(
          `SELECT SUM(images) AS n FROM job_log WHERE ${done} AND finished_at >= ?`,
          today,
        ),
      },
      perDay,
      gpuMs: {
        total: one("SELECT SUM(duration_ms) AS n FROM job_log"),
        week: one("SELECT SUM(duration_ms) AS n FROM job_log WHERE finished_at >= ?", week),
      },
      runs: {
        total: one("SELECT COUNT(*) AS n FROM job_log"),
        failed: one("SELECT COUNT(*) AS n FROM job_log WHERE state = 'error'"),
      },
      rate: stepMs > 0 ? steps / (stepMs / 1000) : null,
      models: top("model"),
      loras: top("lora"),
      wildcards: top("wildcard"),
      workflows,
      firstAt: first.n === null ? null : Number(first.n),
      gallery,
    };
  }

  /* ── picker order ─────────────────────────────────────────────────────── */

  /**
   * What the model pickers put first: your favorite models ("<kind>/<ComfyUI name>"), then the
   * ones you used most recently (from the job log).
   */
  modelMarks(): ModelMarks {
    const favorites = this.db()
      .prepare("SELECT kind, name FROM model_marks WHERE favorite = 1 ORDER BY name")
      .all() as Array<{ kind: string; name: string }>;
    return {
      favorites: favorites.map((f) => `${f.kind}/${f.name}`),
      recent: this.recentModels(),
    };
  }

  setModelFavorite(kind: string, name: string, favorite: boolean): ModelMarks {
    const db = this.db();
    if (favorite)
      db.prepare(
        `INSERT INTO model_marks (kind, name, favorite) VALUES (?, ?, 1)
         ON CONFLICT (kind, name) DO UPDATE SET favorite = 1`,
      ).run(kind, name);
    else db.prepare("DELETE FROM model_marks WHERE kind = ? AND name = ?").run(kind, name);
    return this.modelMarks();
  }

  /* ── errors ───────────────────────────────────────────────────────────── */

  addError(error: AppError): void {
    if (!this.deps.profiles.active) return;
    const db = this.db();
    db.prepare(
      "INSERT OR REPLACE INTO error_log (id, at, source, title, detail) VALUES (?, ?, ?, ?, ?)",
    ).run(error.id, error.at, error.source, error.title, error.detail);
    db.prepare(
      "DELETE FROM error_log WHERE id IN (SELECT id FROM error_log ORDER BY at DESC LIMIT -1 OFFSET ?)",
    ).run(MAX_ERRORS);
  }

  errors(): AppError[] {
    const rows = this.db()
      .prepare("SELECT * FROM error_log ORDER BY at DESC LIMIT ?")
      .all(MAX_ERRORS) as Array<{
      id: string;
      at: number;
      source: string;
      title: string;
      detail: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      at: Number(r.at),
      source: r.source as AppError["source"],
      title: r.title,
      detail: r.detail,
    }));
  }

  clearErrors(ids?: string[]): number {
    const db = this.db();
    if (!ids) return Number(db.prepare("DELETE FROM error_log").run().changes);
    let n = 0;
    const del = db.prepare("DELETE FROM error_log WHERE id = ?");
    for (const id of ids) n += Number(del.run(id).changes);
    return n;
  }
}
