/**
 * The download queue (ADR-0012). Model files from Civitai and the ComfyUI catalog are fetched by
 * the server into the profile's models folder, a few at a time, with progress on the live bus.
 *
 *  - Each file is written to "<target>.part" next to where it lands and moved into place when
 *    complete (never over an existing file), so a dropped connection, a pause or an app restart
 *    resumes with an HTTP range request instead of starting over.
 *  - Civitai files are checked against Civitai's SHA256; the profile's API key is sent only to
 *    Civitai itself, never to the storage host a download redirects to.
 *  - A finished Civitai download gets its sidecars (.civitai.info, .preview.png, unless turned
 *    off), its hash and Civitai match go into the lookup tables, and the model lists refresh.
 *  - Every download is a row in the profile's database (the History view); unfinished ones come
 *    back paused when the profile opens again.
 */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CIVITAI_TYPE_LABELS, civitaiKind } from "../../shared/civitai.ts";
import {
  cleanFolder,
  type Download,
  type DownloadHistoryPage,
  type DownloadPlan,
  type DownloadProgress,
  type DownloadState,
  type DownloadsSnapshot,
  type EnqueueBody,
  isFinished,
  kindFolder,
  type PlanInput,
  planFileName,
  planFolder,
} from "../../shared/downloads.ts";
import type { LiveTopic, ServerMessage } from "../../shared/live.ts";
import { type LookupInfo, LookupInfo as LookupInfoSchema } from "../../shared/models.ts";
import type { ProfileDbs } from "../db/profileDb.ts";
import {
  commitPart,
  exists,
  openPartFile,
  PART_SUFFIX,
  type PartFile,
  removePart,
  resolveInside,
  writeFileIfAbsent,
} from "../lib/fsx.ts";
import { HttpError } from "../lib/http.ts";
import { fetchFollow } from "../lib/remote.ts";
import type { CivitaiService } from "./civitai/index.ts";
import { infoSidecar, lookupInfo, previewSource, primaryFile } from "./civitai/normalize.ts";
import type { ModelLookup } from "./lookup.ts";
import type { ManagerCatalog } from "./manager.ts";
import type { ModelService } from "./models.ts";
import type { ProfileService } from "./profiles.ts";
import type { SettingsService } from "./settings.ts";

const PROGRESS_MS = 250;
const SPEED_WINDOW_MS = 3000;
const KEEP_FINISHED = 30;

export interface DownloadDeps {
  profiles: ProfileService;
  settings: SettingsService;
  dbs: ProfileDbs;
  models: ModelService;
  civitai: CivitaiService;
  catalog: ManagerCatalog;
  lookup: ModelLookup;
  publish: (topic: LiveTopic | null, msg: ServerMessage) => void;
  /** A file landed in the models folder (lists should refresh). */
  onFinished: () => void;
  fetch?: typeof fetch;
}

/** What a download needs to (re)start, stored with its row. */
interface Job {
  url: string;
  /** Send the profile's Civitai key (to Civitai's own origin only). */
  civitaiAuth: boolean;
  /** Expected SHA256 (uppercase), when the source publishes one. */
  sha256: string | null;
  /** The .civitai.info to save next to the model. */
  info: Record<string, unknown> | null;
  /** Remote image for the .preview.png. */
  preview: string | null;
  /** What to remember about the file once it's in place. */
  lookup: LookupInfo | null;
}

interface Item {
  d: Download;
  profileId: string;
  job: Job;
  run: { abort: AbortController; reason: "pause" | "cancel" | null } | null;
  samples: Array<[number, number]>;
}

interface Prepared {
  plan: DownloadPlan;
  fields: Pick<
    Download,
    "source" | "name" | "dest" | "kind" | "size" | "modelId" | "versionId" | "entryId" | "thumb"
  >;
  job: Job;
}

class DownloadError extends Error {}

interface Row {
  id: string;
  source: string;
  name: string;
  dest: string;
  kind: string | null;
  size: number | null;
  received: number;
  state: string;
  error: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  model_id: number | null;
  version_id: number | null;
  entry_id: string | null;
  thumb: string | null;
  job: string;
}

function fromRow(r: Row): Download {
  return {
    id: r.id,
    source: r.source === "manager" ? "manager" : "civitai",
    name: r.name,
    dest: r.dest,
    kind: (r.kind as Download["kind"]) ?? null,
    size: r.size,
    received: r.received,
    state: r.state as DownloadState,
    error: r.error,
    createdAt: r.created_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    modelId: r.model_id,
    versionId: r.version_id,
    entryId: r.entry_id,
    thumb: r.thumb,
  };
}

function parseJob(text: string): Job {
  const raw = JSON.parse(text) as Partial<Job>;
  return {
    url: String(raw.url ?? ""),
    civitaiAuth: raw.civitaiAuth === true,
    sha256: typeof raw.sha256 === "string" ? raw.sha256 : null,
    info: raw.info && typeof raw.info === "object" ? raw.info : null,
    preview: typeof raw.preview === "string" ? raw.preview : null,
    lookup: raw.lookup ? (LookupInfoSchema.safeParse(raw.lookup).data ?? null) : null,
  };
}

const toRel = (p: string) => p.split(path.sep).join("/");

/** Feed the first `bytes` of a file into a hash (resuming a partly downloaded file). */
async function hashInto(hash: ReturnType<typeof createHash>, file: string, bytes: number) {
  if (bytes <= 0) return;
  const stream = createReadStream(file, { start: 0, end: bytes - 1, highWaterMark: 4 << 20 });
  for await (const chunk of stream) hash.update(chunk as Buffer);
}

export class DownloadQueue {
  private readonly deps: DownloadDeps;
  private items: Item[] = [];
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  private parallel = 2;

  constructor(deps: DownloadDeps) {
    this.deps = deps;
  }

  private active(): string {
    const id = this.deps.profiles.active;
    if (!id) throw new HttpError(409, "Open a profile first.", "no_profile");
    return id;
  }

  private async rootOf(profileId: string): Promise<string | null> {
    const root = (await this.deps.profiles.get(profileId)).paths.models.trim();
    if (!root) return null;
    return (await fs.stat(root).then(
      (s) => s.isDirectory(),
      () => false,
    ))
      ? root
      : null;
  }

  /* ── snapshot ────────────────────────────────────────────────────────── */

  snapshot(): DownloadsSnapshot {
    const order: Record<DownloadState, number> = {
      running: 0,
      queued: 1,
      paused: 2,
      error: 3,
      done: 3,
      cancelled: 3,
    };
    const items = [...this.items]
      .sort((a, b) => {
        const oa = order[a.d.state];
        const ob = order[b.d.state];
        if (oa !== ob) return oa - ob;
        if (oa === 3) return (b.d.finishedAt ?? 0) - (a.d.finishedAt ?? 0);
        return a.d.createdAt - b.d.createdAt;
      })
      .map((i) => i.d);
    return { items, parallel: this.parallel };
  }

  private publish(): void {
    this.deps.publish("downloads", { t: "downloads", downloads: this.snapshot() });
  }

  private progressSoon(): void {
    if (this.progressTimer) return;
    this.progressTimer = setTimeout(() => {
      this.progressTimer = null;
      const now = Date.now();
      const items: DownloadProgress[] = [];
      for (const i of this.items)
        if (i.d.state === "running") items.push({ ...this.speedOf(i, now), id: i.d.id });
      if (items.length) this.deps.publish("downloads", { t: "download.progress", items });
    }, PROGRESS_MS);
  }

  private speedOf(item: Item, now: number): Omit<DownloadProgress, "id"> {
    item.samples.push([now, item.d.received]);
    while (item.samples.length > 2 && now - (item.samples[0]?.[0] ?? now) > SPEED_WINDOW_MS)
      item.samples.shift();
    const [t0, r0] = item.samples[0] ?? [now, item.d.received];
    const speed = now > t0 ? ((item.d.received - r0) * 1000) / (now - t0) : 0;
    return { received: item.d.received, size: item.d.size, speed: Math.max(0, Math.round(speed)) };
  }

  /** Change a download, save the row, tell the windows. */
  private update(item: Item, patch: Partial<Download>, announce = true): void {
    item.d = { ...item.d, ...patch };
    try {
      const d = item.d;
      this.deps.dbs
        .get(item.profileId)
        .db.prepare(
          `UPDATE downloads SET name = ?, dest = ?, size = ?, received = ?, state = ?, error = ?,
             started_at = ?, finished_at = ? WHERE id = ?`,
        )
        .run(d.name, d.dest, d.size, d.received, d.state, d.error, d.startedAt, d.finishedAt, d.id);
    } catch (error) {
      console.warn("Couldn't save a download's state:", error);
    }
    if (announce) this.publish();
  }

  /* ── planning ────────────────────────────────────────────────────────── */

  async plan(body: EnqueueBody): Promise<DownloadPlan> {
    return (await this.prepare(this.active(), body)).plan;
  }

  private async prepare(profileId: string, body: EnqueueBody): Promise<Prepared> {
    const root = await this.rootOf(profileId);
    const blockedRoot = root
      ? null
      : "This profile has no models folder yet. Choose one in Settings → Folders.";
    if (body.source === "manager") {
      const e = await this.deps.catalog.entry(body.entryId);
      const rel = e.folder ? `${e.folder}/${e.filename}` : e.filename;
      const abs = root && e.folder ? resolveInside(root, rel) : null;
      const installed = abs && (await exists(abs)) ? rel : null;
      const kf = e.folder?.split("/")[0] ?? "";
      return {
        plan: {
          name: e.name,
          kind: e.kind,
          kindFolder: kf,
          folder: e.folder?.split("/").slice(1).join("/") ?? "",
          file: e.filename,
          path: abs ?? rel,
          size: e.size,
          nameTaken: installed !== null,
          installed,
          blocked:
            blockedRoot ??
            (e.folder
              ? null
              : "This file goes into a custom node's folder. Install it with ComfyUI Manager."),
        },
        fields: {
          source: "manager",
          name: e.name,
          dest: rel,
          kind: e.kind,
          size: e.size,
          modelId: null,
          versionId: null,
          entryId: e.id,
          thumb: null,
        },
        job: {
          url: e.url,
          civitaiAuth: false,
          sha256: null,
          info: null,
          preview: null,
          lookup: null,
        },
      };
    }

    const civitai = this.deps.civitai;
    const raw = await civitai.rawModel(body.modelId);
    let v = raw.modelVersions?.find((x) => x.id === body.versionId);
    if (!v) {
      v = await civitai.rawVersion(body.versionId);
      if (v.modelId !== undefined && v.modelId !== raw.id)
        throw new HttpError(400, "That version belongs to another model.", "bad_version");
    }
    const f = body.fileId ? v.files?.find((x) => x.id === body.fileId) : primaryFile(v);
    if (!f?.downloadUrl || !f.name)
      throw new HttpError(404, "That file isn't on Civitai anymore.", "no_file");
    const kind = body.kind ?? civitaiKind(raw.type ?? "");
    const settings = (await this.deps.settings.get(profileId)).civitai.downloads;
    const input: PlanInput = {
      fileName: f.name,
      modelName: raw.name ?? `Model ${raw.id}`,
      versionName: v.name ?? `v${v.id}`,
      baseModel: v.baseModel ?? null,
      creator: raw.creator?.username ?? null,
      tags: raw.tags ?? [],
    };
    const folder =
      body.folder !== undefined
        ? cleanFolder(body.folder)
        : planFolder(input, settings.folderBy, settings.aliases);
    const file = planFileName(input, settings.naming);
    const kf = kind ? kindFolder(kind) : "";
    const rel = [kf, folder, file].filter(Boolean).join("/");
    const abs = root && kind ? resolveInside(root, rel) : null;
    const sha256 = f.hashes?.SHA256?.toUpperCase() ?? null;
    const ctx = { allowed: civitai.allowedImage, site: civitai.site };
    const lookup = lookupInfo(v, ctx, raw);
    return {
      plan: {
        name: `${input.modelName} · ${input.versionName}`,
        kind,
        kindFolder: kf,
        folder,
        file,
        path: abs ?? rel,
        size: typeof f.sizeKB === "number" ? Math.round(f.sizeKB * 1024) : null,
        nameTaken: abs ? await exists(abs) : false,
        installed: await this.installedCopy(profileId, v.id, sha256),
        blocked:
          blockedRoot ??
          (kind
            ? null
            : `Blombo doesn't know where ${CIVITAI_TYPE_LABELS[raw.type ?? ""] ?? raw.type ?? "these"} models go. Pick a folder for it.`),
      },
      fields: {
        source: "civitai",
        name: `${input.modelName} · ${input.versionName}`,
        dest: rel,
        kind,
        size: typeof f.sizeKB === "number" ? Math.round(f.sizeKB * 1024) : null,
        modelId: raw.id,
        versionId: v.id,
        entryId: null,
        // NSFW previews aren't shown in download lists (they can't be blurred there).
        thumb: lookup && !lookup.imageNsfw && !lookup.nsfw ? lookup.image : null,
      },
      job: {
        url: f.downloadUrl,
        civitaiAuth: true,
        sha256,
        info: infoSidecar(raw, v),
        preview: previewSource(v, civitai.allowedImage),
        lookup,
      },
    };
  }

  /** A local file that already is this version (by its info file, lookup or hash). */
  private async installedCopy(
    profileId: string,
    versionId: number,
    sha256: string | null,
  ): Promise<string | null> {
    try {
      const list = await this.deps.models.list();
      const hit = list.models.find((m) => m.civitai?.versionId === versionId);
      if (hit) return hit.id;
    } catch {
      // No models folder: nothing is installed.
    }
    if (!sha256) return null;
    const row = this.deps.dbs
      .get(profileId)
      .db.prepare("SELECT path FROM model_hashes WHERE sha256 = ? LIMIT 1")
      .get(sha256) as { path: string } | undefined;
    return row?.path ?? null;
  }

  /* ── queue ───────────────────────────────────────────────────────────── */

  async enqueue(body: EnqueueBody): Promise<Download> {
    const profileId = this.active();
    const prepared = await this.prepare(profileId, body);
    if (prepared.plan.blocked) throw new HttpError(409, prepared.plan.blocked, "blocked");
    if (body.source === "manager" && prepared.plan.installed)
      throw new HttpError(409, `"${prepared.plan.file}" is already installed.`, "installed");
    const settings = await this.deps.settings.get(profileId);
    // From the duplicate check to the push there's no await, so two quick requests for the same
    // file can't both pass it (they'd write the same .part file).
    const dup = this.items.find(
      (i) =>
        !isFinished(i.d.state) &&
        (i.job.url === prepared.job.url ||
          i.d.dest.toLowerCase() === prepared.fields.dest.toLowerCase()),
    );
    if (dup)
      throw new HttpError(409, `"${dup.d.name}" is already in the download queue.`, "queued");
    this.parallel = settings.civitai.downloads.parallel;
    const d: Download = {
      ...prepared.fields,
      id: randomUUID(),
      received: 0,
      state: "queued",
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    };
    this.deps.dbs
      .get(profileId)
      .db.prepare(
        `INSERT INTO downloads (id, source, name, dest, kind, size, received, state, error,
           created_at, started_at, finished_at, model_id, version_id, entry_id, thumb, job)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'queued', NULL, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.id,
        d.source,
        d.name,
        d.dest,
        d.kind,
        d.size,
        d.createdAt,
        d.modelId,
        d.versionId,
        d.entryId,
        d.thumb,
        JSON.stringify(prepared.job),
      );
    this.items.push({ d, profileId, job: prepared.job, run: null, samples: [] });
    this.trimFinished();
    this.publish();
    this.pump();
    return d;
  }

  private find(id: string): Item {
    const item = this.items.find((i) => i.d.id === id);
    if (!item) throw new HttpError(404, "That download isn't in the queue anymore.", "no_download");
    return item;
  }

  pause(id: string): Download {
    const item = this.find(id);
    if (item.run) {
      item.run.reason = "pause";
      item.run.abort.abort();
    } else if (item.d.state === "queued") this.update(item, { state: "paused" });
    return item.d;
  }

  /** Resume a paused download, or retry a failed or cancelled one (from where it stopped). */
  async resume(id: string): Promise<Download> {
    let item = this.items.find((i) => i.d.id === id);
    if (!item) item = this.loadRow(this.active(), id);
    if (item.d.state === "running" || item.d.state === "queued") return item.d;
    if (item.d.state === "done")
      throw new HttpError(409, "That download already finished.", "finished");
    this.parallel = (await this.deps.settings.get(item.profileId)).civitai.downloads.parallel;
    this.update(item, { state: "queued", error: null, finishedAt: null });
    this.pump();
    return item.d;
  }

  async cancel(id: string): Promise<Download> {
    const item = this.find(id);
    if (item.run) {
      item.run.reason = "cancel";
      item.run.abort.abort();
      return item.d;
    }
    if (isFinished(item.d.state) && item.d.state !== "error") return item.d;
    await this.removePartOf(item);
    this.update(item, { state: "cancelled", finishedAt: Date.now() });
    this.pump();
    return item.d;
  }

  setParallel(n: number): void {
    this.parallel = n;
    this.publish();
    this.pump();
  }

  /** Take finished downloads off the list (they stay in the history). */
  clearFinished(): DownloadsSnapshot {
    for (let i = this.items.length - 1; i >= 0; i--)
      if (isFinished(this.items[i]?.d.state ?? "queued")) this.items.splice(i, 1);
    this.publish();
    return this.snapshot();
  }

  private trimFinished(): void {
    const finished = this.items
      .filter((i) => isFinished(i.d.state))
      .sort((a, b) => (b.d.finishedAt ?? 0) - (a.d.finishedAt ?? 0));
    for (const old of finished.slice(KEEP_FINISHED)) this.items.splice(this.items.indexOf(old), 1);
  }

  private pump(): void {
    let running = this.items.filter((i) => i.d.state === "running").length;
    for (const item of [...this.items].sort((a, b) => a.d.createdAt - b.d.createdAt)) {
      if (running >= this.parallel) break;
      if (item.d.state !== "queued" || item.run) continue;
      running++;
      void this.run(item);
    }
  }

  /* ── running one ─────────────────────────────────────────────────────── */

  private async removePartOf(item: Item): Promise<void> {
    const root = await this.rootOf(item.profileId).catch(() => null);
    if (!root) return;
    await removePart(resolveInside(root, item.d.dest) + PART_SUFFIX).catch(() => undefined);
  }

  private async run(item: Item): Promise<void> {
    const abort = new AbortController();
    item.run = { abort, reason: null };
    this.update(item, { state: "running", startedAt: item.d.startedAt ?? Date.now(), error: null });
    let open: PartFile | null = null;
    let target = "";
    try {
      const root = await this.rootOf(item.profileId);
      if (!root)
        throw new DownloadError(
          "The models folder isn't there. Check it in Settings → Folders, then retry.",
        );
      target = resolveInside(root, item.d.dest);
      const key = item.job.civitaiAuth ? await this.deps.civitai.key(item.profileId) : null;
      let part = await openPartFile(target, true);
      open = part;
      let res = await this.request(item, part.offset, key, abort.signal);
      if (part.offset > 0 && (res.status === 200 || res.status === 416)) {
        // The server ignored the range, or the part no longer fits the file: start over.
        await res.body?.cancel().catch(() => undefined);
        await part.close();
        part = await openPartFile(target, false);
        open = part;
        res = await this.request(item, 0, key, abort.signal);
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new DownloadError(this.describeStatus(res.status, item, key));
      }
      const hash = createHash("sha256");
      await hashInto(hash, part.path, part.offset);
      await this.stream(item, res, part, hash);
      await part.close();
      open = null;
      await this.finish(item, root, target, hash.digest("hex").toUpperCase());
    } catch (error) {
      await open?.close().catch(() => undefined);
      await this.failed(item, abort, target, error);
    } finally {
      item.run = null;
      this.pump();
    }
  }

  private request(
    item: Item,
    offset: number,
    key: string | null,
    signal: AbortSignal,
  ): Promise<Response> {
    return fetchFollow(item.job.url, {
      headers: offset > 0 ? { range: `bytes=${offset}-` } : {},
      auth: key ? { origin: this.deps.civitai.api.origin, header: `Bearer ${key}` } : undefined,
      signal,
      fetch: this.deps.fetch,
    });
  }

  private async stream(
    item: Item,
    res: Response,
    part: PartFile,
    hash: ReturnType<typeof createHash>,
  ): Promise<void> {
    const length = Number(res.headers.get("content-length")) || 0;
    const total = length ? part.offset + length : item.d.size;
    item.d.received = part.offset;
    if (total && total !== item.d.size) this.update(item, { size: total }, false);
    item.samples = [[Date.now(), part.offset]];
    if (!res.body) throw new DownloadError("The server sent an empty answer. Retry in a moment.");
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      await part.write(chunk);
      hash.update(chunk);
      item.d.received += chunk.byteLength;
      this.progressSoon();
    }
    if (item.d.size && item.d.received < item.d.size)
      throw new DownloadError("The download stopped early. Resume it to continue.");
  }

  private async finish(item: Item, root: string, target: string, sha256: string): Promise<void> {
    const part = target + PART_SUFFIX;
    if (item.job.sha256 && sha256 !== item.job.sha256) {
      await removePart(part);
      throw new DownloadError(
        "The file didn't match Civitai's checksum, so it was thrown away. Download it again.",
      );
    }
    const final = await commitPart(part, target);
    const dest = toRel(path.relative(root, final));
    await this.sidecars(item, final).catch((error) =>
      console.warn(`Couldn't save the info files for "${item.d.name}":`, error),
    );
    try {
      const stat = await fs.stat(final);
      this.deps.lookup.recordHash(item.profileId, dest, stat.size, stat.mtimeMs, sha256);
      if (item.job.lookup)
        this.deps.lookup.recordLookup(item.profileId, sha256, "found", item.job.lookup);
    } catch (error) {
      console.warn("Couldn't remember the downloaded file's hash:", error);
    }
    this.update(item, {
      state: "done",
      dest,
      received: item.d.size ?? item.d.received,
      finishedAt: Date.now(),
      error: null,
    });
    void this.trimHistory(item.profileId);
    this.trimFinished();
    this.deps.onFinished();
  }

  private async failed(
    item: Item,
    abort: AbortController,
    target: string,
    error: unknown,
  ): Promise<void> {
    if (abort.signal.aborted) {
      if (item.run?.reason === "cancel") {
        if (target) await removePart(target + PART_SUFFIX).catch(() => undefined);
        this.update(item, { state: "cancelled", finishedAt: Date.now() });
      } else this.update(item, { state: "paused" });
      return;
    }
    const code = (error as NodeJS.ErrnoException)?.code;
    const message =
      error instanceof DownloadError || error instanceof HttpError
        ? error.message
        : code === "ENOSPC"
          ? "The disk is full. Free some space, then resume."
          : code === "EPERM" || code === "EACCES" || code === "EBUSY"
            ? "Blombo can't write into the models folder (in use or not allowed). Resume when it's free."
            : "The connection dropped. Resume to continue where it stopped.";
    this.update(item, { state: "error", error: message, finishedAt: Date.now() });
  }

  private describeStatus(status: number, item: Item, key: string | null): string {
    if (status === 401 || status === 403)
      return item.job.civitaiAuth
        ? key
          ? "Civitai refused the download with your API key. The file may be early access or need you to log in on civitai.com."
          : "Civitai needs your API key for this download. Add it in Settings → Civitai, then retry."
        : "The server refused the download (it may need a login). Download it in your browser and put it in the models folder.";
    if (status === 404) return "The file isn't there anymore.";
    if (status === 429) return "Too many downloads right now. Retry in a minute.";
    return `The download failed (HTTP ${status}). Retry in a moment.`;
  }

  /** .civitai.info and .preview.png next to the model, unless they're turned off or exist. */
  private async sidecars(item: Item, final: string): Promise<void> {
    if (item.d.source !== "civitai") return;
    const opts = (await this.deps.settings.get(item.profileId)).civitai.downloads;
    const stem = final.slice(0, final.length - path.extname(final).length);
    if (opts.saveInfo && item.job.info)
      await writeFileIfAbsent(
        `${stem}.civitai.info`,
        `${JSON.stringify(item.job.info, null, 2)}\n`,
      );
    if (opts.savePreview && item.job.preview) {
      const bytes = await this.deps.civitai.images.bytes(item.job.preview);
      const png = await sharp(bytes, { failOn: "none" })
        .rotate()
        .resize({ width: 512, height: 768, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 8 })
        .toBuffer();
      await writeFileIfAbsent(`${stem}.preview.png`, png);
    }
  }

  /* ── history ─────────────────────────────────────────────────────────── */

  history(offset: number, limit: number): DownloadHistoryPage {
    const profileId = this.active();
    const { db } = this.deps.dbs.get(profileId);
    const total = (db.prepare("SELECT COUNT(*) AS n FROM downloads").get() as { n: number }).n;
    const rows = db
      .prepare("SELECT * FROM downloads ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as unknown as Row[];
    const live = new Map(this.items.map((i) => [i.d.id, i.d]));
    return { items: rows.map((r) => live.get(r.id) ?? fromRow(r)), total };
  }

  clearHistory(): void {
    const profileId = this.active();
    this.deps.dbs
      .get(profileId)
      .db.exec("DELETE FROM downloads WHERE state IN ('done', 'error', 'cancelled')");
  }

  private async trimHistory(profileId: string): Promise<void> {
    const limit = (await this.deps.settings.get(profileId)).civitai.history.downloads;
    this.deps.dbs
      .get(profileId)
      .db.prepare(
        `DELETE FROM downloads WHERE state IN ('done', 'error', 'cancelled') AND id NOT IN
           (SELECT id FROM downloads ORDER BY created_at DESC LIMIT ?)`,
      )
      .run(limit);
  }

  /** The file (or, while unfinished, its folder) for "Reveal". */
  async revealTarget(id: string): Promise<string> {
    const profileId = this.active();
    const item =
      this.items.find((i) => i.d.id === id && i.profileId === profileId) ??
      this.loadRow(profileId, id, false);
    const root = await this.rootOf(profileId);
    if (!root) throw new HttpError(409, "This profile has no models folder.", "no_models");
    const file = resolveInside(root, item.d.dest);
    if (await exists(file)) return file;
    const dir = path.dirname(file);
    if (await exists(dir)) return dir;
    throw new HttpError(404, "That file isn't in the models folder anymore.", "file_missing");
  }

  private loadRow(profileId: string, id: string, keep = true): Item {
    const row = this.deps.dbs
      .get(profileId)
      .db.prepare("SELECT * FROM downloads WHERE id = ?")
      .get(id) as Row | undefined;
    if (!row)
      throw new HttpError(404, "That download isn't in the history anymore.", "no_download");
    const item: Item = {
      d: fromRow(row),
      profileId,
      job: parseJob(row.job),
      run: null,
      samples: [],
    };
    if (keep) this.items.push(item);
    return item;
  }

  /* ── profile open and shutdown ──────────────────────────────────────── */

  /** Bring back a profile's unfinished downloads (paused) after a restart. */
  restore(profileId: string): void {
    let rows: Row[];
    try {
      rows = this.deps.dbs
        .get(profileId)
        .db.prepare(
          "SELECT * FROM downloads WHERE state IN ('queued', 'running', 'paused') ORDER BY created_at",
        )
        .all() as unknown as Row[];
    } catch (error) {
      console.warn("Couldn't read the download history:", error);
      return;
    }
    let added = false;
    for (const row of rows) {
      if (this.items.some((i) => i.d.id === row.id)) continue;
      const item: Item = {
        d: fromRow(row),
        profileId,
        job: parseJob(row.job),
        run: null,
        samples: [],
      };
      this.items.push(item);
      if (item.d.state !== "paused") this.update(item, { state: "paused" }, false);
      added = true;
    }
    if (added) this.publish();
  }

  /** A profile is being removed: stop its downloads and forget them (their rows go with it). */
  dropProfile(profileId: string): void {
    for (const item of this.items)
      if (item.profileId === profileId && item.run) {
        item.run.reason = "pause";
        item.run.abort.abort();
      }
    const before = this.items.length;
    this.items = this.items.filter((i) => i.profileId !== profileId);
    if (this.items.length !== before) this.publish();
  }

  /** Stop everything; unfinished downloads are saved as paused and resume later. */
  shutdown(): void {
    for (const item of this.items)
      if (item.run) {
        item.run.reason = "pause";
        item.run.abort.abort();
        this.update(item, { state: "paused" }, false);
      }
    if (this.progressTimer) clearTimeout(this.progressTimer);
  }
}
