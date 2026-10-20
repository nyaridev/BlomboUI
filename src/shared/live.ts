/**
 * The live bus (ADR-0008): one WebSocket per window at /api/live. JSON messages are a Zod
 * discriminated union on `t`; preview images travel as binary frames (see encodePreviewFrame).
 *
 * Topics a client subscribes to:
 *   comfy   ComfyUI status changes
 *   system  GPU stats at 1 Hz, sampled only while at least one window is visible
 *   jobs    queue snapshots, per-step progress, finished images, preview frames
 *   logs    ComfyUI log lines (only while a log view is open)
 *   gallery new images, index changes and sync progress (while a gallery is mounted)
 *   install ComfyUI slot installer and custom node installer progress (while a view showing
 *           either is open)
 *   downloads the download queue and its progress (the header shows it, so every window follows)
 * Errors, profile switches and model-folder changes go to everyone.
 */
import { z } from "zod";
import { ComfyLogLine, ComfyStatus, SystemStats } from "./comfy.ts";
import { DownloadProgress, DownloadsSnapshot } from "./downloads.ts";
import { GalleryImage, SyncState } from "./gallery.ts";
import { InstallState, NodeInstallState } from "./install.ts";
import { JobImage, JobProgress, QueueSnapshot } from "./jobs.ts";
import { LookupState } from "./models.ts";

export const LIVE_TOPICS = [
  "comfy",
  "system",
  "jobs",
  "logs",
  "gallery",
  "install",
  "downloads",
] as const;
export const LiveTopic = z.enum(LIVE_TOPICS);
export type LiveTopic = z.infer<typeof LiveTopic>;

export const AppError = z.object({
  id: z.string(),
  at: z.number(),
  source: z.enum(["comfy", "job", "server"]),
  title: z.string(),
  detail: z.string(),
});
export type AppError = z.infer<typeof AppError>;

export const ServerMessage = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("hello"),
    comfy: ComfyStatus,
    queue: QueueSnapshot,
    profileId: z.string().nullable(),
    downloads: DownloadsSnapshot.optional(),
  }),
  z.object({ t: z.literal("comfy.status"), status: ComfyStatus }),
  z.object({ t: z.literal("comfy.log"), lines: z.array(ComfyLogLine) }),
  z.object({ t: z.literal("system"), stats: SystemStats }),
  z.object({ t: z.literal("queue"), queue: QueueSnapshot }),
  z.object({
    t: z.literal("job.progress"),
    jobId: z.string(),
    seq: z.number().int(),
    progress: JobProgress,
  }),
  z.object({ t: z.literal("job.image"), jobId: z.string(), image: JobImage }),
  z.object({ t: z.literal("error"), error: AppError }),
  z.object({ t: z.literal("profile.switched"), profileId: z.string() }),
  /** A finished job's image was indexed (newest first in the default view). */
  z.object({ t: z.literal("gallery.added"), image: GalleryImage }),
  /** Images were trashed, restored, favorited or re-indexed: lists should refetch. */
  z.object({ t: z.literal("gallery.changed") }),
  z.object({ t: z.literal("gallery.sync"), sync: SyncState }),
  z.object({ t: z.literal("install"), install: InstallState }),
  /** Custom node packs being installed into the managed slot. */
  z.object({ t: z.literal("nodes.install"), install: NodeInstallState }),
  /** Model files were renamed, moved, downloaded or matched on Civitai. */
  z.object({ t: z.literal("models.changed") }),
  /** Background hashing and Civitai lookup of local models. */
  z.object({ t: z.literal("models.lookup"), lookup: LookupState }),
  /** The download queue changed (added, started, finished, removed). */
  z.object({ t: z.literal("downloads"), downloads: DownloadsSnapshot }),
  /** Bytes received, batched a few times a second. */
  z.object({ t: z.literal("download.progress"), items: z.array(DownloadProgress) }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

export const ClientMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("subscribe"), topics: z.array(LiveTopic) }),
  z.object({ t: z.literal("unsubscribe"), topics: z.array(LiveTopic) }),
  /** Sent when the window is shown or hidden, so stats sampling can pause. */
  z.object({ t: z.literal("visible"), visible: z.boolean() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/* ── binary preview frames ───────────────────────────────────────────────────
 * [0..3] job seq (uint32, big-endian) · [4] image kind · [5..] image bytes.
 * ComfyUI's previews are already JPEG or PNG, so they are passed through unchanged.
 */

export const PREVIEW_KINDS = { 1: "image/jpeg", 2: "image/png", 3: "image/webp" } as const;
export type PreviewKind = keyof typeof PREVIEW_KINDS;
export const PREVIEW_HEADER_BYTES = 5;

export function encodePreviewFrame(
  jobSeq: number,
  kind: PreviewKind,
  image: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(PREVIEW_HEADER_BYTES + image.byteLength);
  new DataView(out.buffer).setUint32(0, jobSeq >>> 0, false);
  out[4] = kind;
  out.set(image, PREVIEW_HEADER_BYTES);
  return out;
}

export function decodePreviewFrame(
  data: ArrayBuffer | Uint8Array,
): { jobSeq: number; mime: string; image: Uint8Array } | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength <= PREVIEW_HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = bytes[4] as PreviewKind;
  const mime = PREVIEW_KINDS[kind];
  if (!mime) return null;
  return { jobSeq: view.getUint32(0, false), mime, image: bytes.subarray(PREVIEW_HEADER_BYTES) };
}
