/**
 * The live bus client (ADR-0008): one WebSocket per window at /api/live, reconnecting with
 * backoff. Messages land in the `useLive` store; components select the smallest slice they
 * need (a progress number, the ComfyUI state), so a progress tick never re-renders the queue.
 * Preview frames are decoded off the main paint with createImageBitmap.
 */
import type { ComfyLogLine, ComfyStatus, SystemStats } from "@shared/comfy";
import type { Download, DownloadProgress } from "@shared/downloads";
import type { GalleryImage, SyncState } from "@shared/gallery";
import type { InstallState, NodeInstallState } from "@shared/install";
import type { JobProgress, QueueSnapshot } from "@shared/jobs";
import {
  type AppError,
  type ClientMessage,
  decodePreviewFrame,
  type LiveTopic,
  ServerMessage,
} from "@shared/live";
import type { LookupState } from "@shared/models";
import { create } from "zustand";
import { type GalleryPages, qk, queryClient } from "./queries";
import { useSession } from "./session";

export interface LivePreview {
  jobSeq: number;
  bitmap: ImageBitmap;
}

interface LiveState {
  connected: boolean;
  comfy: ComfyStatus | null;
  stats: SystemStats | null;
  queue: QueueSnapshot;
  /** Step progress of the running job, kept apart from `queue` so ticks stay cheap. */
  progress: { jobId: string; seq: number; progress: JobProgress } | null;
  preview: LivePreview | null;
  errors: AppError[];
  logs: ComfyLogLine[];
  /** Gallery folder scan progress (while a gallery view follows the topic). */
  gallerySync: SyncState | null;
  /** Images added since the open gallery list was loaded, for lists that can't show them. */
  galleryNew: number;
  /** The ComfyUI installer, while an installer view is open. */
  install: InstallState | null;
  /** Custom node packs being installed for a stage (follows the same topic). */
  nodeInstall: NodeInstallState | null;
  /** The download queue: running, queued and paused first, then this session's finished ones. */
  downloads: Download[];
  /** Bytes and speed of running downloads, kept apart so ticks don't re-render lists. */
  downloadProgress: Record<string, DownloadProgress>;
  /** Background hashing and Civitai matching of local models. */
  lookup: LookupState | null;
}

export const useLive = create<LiveState>(() => ({
  connected: false,
  comfy: null,
  stats: null,
  queue: { jobs: [], loop: false, waiting: false },
  progress: null,
  preview: null,
  errors: [],
  logs: [],
  gallerySync: null,
  galleryNew: 0,
  install: null,
  nodeInstall: null,
  downloads: [],
  downloadProgress: {},
  lookup: null,
}));

const BASE_TOPICS: LiveTopic[] = ["comfy", "system", "jobs", "downloads"];
const BACKOFF_MS = [400, 1000, 2000, 4000, 8000];
const MAX_LOGS = 2000;

let socket: WebSocket | null = null;
let started = false;
let attempt = 0;
const extra = new Map<LiveTopic, number>();

function send(msg: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function sendVisible(): void {
  send({ t: "visible", visible: document.visibilityState === "visible" });
}

/** Open the bus once per window (the Shell calls this when a profile is open). */
export function startLive(): void {
  if (started) return;
  started = true;
  document.addEventListener("visibilitychange", sendVisible);
  connect();
}

function connect(): void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/api/live`);
  ws.binaryType = "arraybuffer";
  socket = ws;
  ws.onopen = () => {
    attempt = 0;
    useLive.setState({ connected: true });
    send({ t: "subscribe", topics: [...BASE_TOPICS, ...extra.keys()] });
    sendVisible();
  };
  ws.onmessage = (e) => {
    if (typeof e.data === "string") onJson(e.data);
    else void onBinary(e.data as ArrayBuffer);
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    useLive.setState({ connected: false });
    const delay = BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)];
    setTimeout(connect, delay);
  };
}

/** Follow an extra topic while a component is mounted (e.g. logs while the log view is open). */
export function followTopic(topic: LiveTopic): () => void {
  const n = extra.get(topic) ?? 0;
  extra.set(topic, n + 1);
  if (n === 0) send({ t: "subscribe", topics: [topic] });
  return () => {
    const left = (extra.get(topic) ?? 1) - 1;
    if (left > 0) extra.set(topic, left);
    else {
      extra.delete(topic);
      send({ t: "unsubscribe", topics: [topic] });
    }
  };
}

export function dismissErrors(): void {
  useLive.setState({ errors: [] });
}

/** Seed the log view with what the server already has. */
export function setLogs(lines: ComfyLogLine[]): void {
  useLive.setState({ logs: lines.slice(-MAX_LOGS) });
}

function onJson(text: string): void {
  let parsed: ReturnType<typeof ServerMessage.safeParse>;
  try {
    parsed = ServerMessage.safeParse(JSON.parse(text));
  } catch {
    return;
  }
  if (!parsed.success) return;
  const msg = parsed.data;
  const s = useLive.getState();
  switch (msg.t) {
    case "hello":
      useLive.setState({ comfy: msg.comfy, queue: msg.queue });
      if (msg.downloads) onDownloads(msg.downloads.items);
      break;
    case "comfy.status": {
      const wasRunning = s.comfy?.state === "running";
      useLive.setState({ comfy: msg.status });
      // Fresh model lists and choices once ComfyUI (re)connects.
      if (msg.status.state === "running" && !wasRunning) {
        void queryClient.invalidateQueries({ queryKey: qk.modelsAll });
        void queryClient.invalidateQueries({ queryKey: ["workflow"] });
        void queryClient.invalidateQueries({ queryKey: ["stage-report"] });
      }
      break;
    }
    case "system":
      useLive.setState({ stats: msg.stats });
      break;
    case "queue": {
      const running = msg.queue.jobs.find((j) => j.state === "running");
      useLive.setState({
        queue: msg.queue,
        progress: running && s.progress?.jobId === running.id ? s.progress : null,
      });
      break;
    }
    case "job.progress":
      useLive.setState({ progress: { jobId: msg.jobId, seq: msg.seq, progress: msg.progress } });
      break;
    case "job.image": {
      const jobs = s.queue.jobs.map((j) =>
        j.id === msg.jobId && !j.images.some((i) => i.filename === msg.image.filename)
          ? { ...j, images: [...j.images, msg.image] }
          : j,
      );
      useLive.setState({ queue: { ...s.queue, jobs } });
      break;
    }
    case "error":
      useLive.setState({ errors: [msg.error, ...s.errors].slice(0, 50) });
      break;
    case "comfy.log":
      useLive.setState({ logs: [...s.logs, ...msg.lines].slice(-MAX_LOGS) });
      break;
    case "profile.switched":
      void queryClient.invalidateQueries({ queryKey: ["workflows"] });
      void queryClient.invalidateQueries({ queryKey: ["layouts"] });
      break;
    case "gallery.added":
      onGalleryAdded(msg.image);
      break;
    case "gallery.changed":
      useLive.setState({ galleryNew: 0 });
      void queryClient.invalidateQueries({ queryKey: ["gallery"] });
      break;
    case "gallery.sync": {
      const wasRunning = s.gallerySync?.running;
      useLive.setState({ gallerySync: msg.sync });
      if (wasRunning && !msg.sync.running)
        void queryClient.invalidateQueries({ queryKey: ["gallery"] });
      break;
    }
    case "install":
      useLive.setState({ install: msg.install });
      if (msg.install.state === "done")
        void queryClient.invalidateQueries({ queryKey: qk.comfySlots });
      break;
    case "nodes.install": {
      const was = s.nodeInstall?.state;
      useLive.setState({ nodeInstall: msg.install });
      // Finished (or failed after changing the slot): ComfyUI's nodes may differ now.
      if (was === "running" && msg.install.state !== "running")
        void queryClient.invalidateQueries({ queryKey: ["stage-report"] });
      break;
    }
    case "models.changed":
      void queryClient.invalidateQueries({ queryKey: ["local-models"] });
      void queryClient.invalidateQueries({ queryKey: qk.modelsAll });
      // A downloaded detector or ControlNet model can fix a stage.
      void queryClient.invalidateQueries({ queryKey: ["stage-report"] });
      break;
    case "models.lookup":
      useLive.setState({ lookup: msg.lookup });
      break;
    case "downloads":
      onDownloads(msg.downloads.items);
      break;
    case "download.progress": {
      const next = { ...s.downloadProgress };
      for (const p of msg.items) next[p.id] = p;
      useLive.setState({ downloadProgress: next });
      break;
    }
  }
}

/**
 * A new queue snapshot. When a download finishes, what depends on the models folder refetches:
 * Civitai pages (installed marks), the Manager store (installed state) and the history.
 */
function onDownloads(items: Download[]): void {
  const prev = new Map(useLive.getState().downloads.map((d) => [d.id, d.state]));
  const progress = useLive.getState().downloadProgress;
  const kept: Record<string, DownloadProgress> = {};
  for (const d of items)
    if (d.state === "running" && progress[d.id]) kept[d.id] = progress[d.id] as DownloadProgress;
  useLive.setState({ downloads: items, downloadProgress: kept });
  const changed = items.some((d) => prev.get(d.id) !== d.state);
  if (!changed) return;
  void queryClient.invalidateQueries({ queryKey: ["download-history"] });
  if (items.some((d) => d.state === "done" && prev.has(d.id) && prev.get(d.id) !== "done")) {
    void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    void queryClient.invalidateQueries({
      queryKey: ["civitai"],
      predicate: (q) => q.queryKey[2] === "model",
    });
    void queryClient.invalidateQueries({ queryKey: ["download-plan"] });
  }
}

/**
 * A new image: lists showing everything newest-first get it on top at once; filtered or
 * differently sorted lists count it so the view can offer to refresh.
 */
function onGalleryAdded(image: GalleryImage): void {
  const profileId = useSession.getState().profileId;
  let shown = false;
  for (const [key, data] of queryClient.getQueriesData<GalleryPages>({
    queryKey: [...qk.gallery(profileId), "images"],
  })) {
    const q = (key[3] ?? {}) as Record<string, unknown>;
    const plain =
      (q.library === "all" || q.library === image.library) &&
      !q.q &&
      !q.model &&
      !q.lora &&
      q.favorites !== "1" &&
      (q.sort ?? "newest") === "newest";
    if (!plain || !data?.pages[0]) continue;
    // A file written again (same path) moves to the top with its new thumbnail.
    const known = data.pages.some((p) => p.items.some((i) => i.id === image.id));
    const pages = data.pages.map((p) => ({
      ...p,
      items: p.items.filter((i) => i.id !== image.id),
    }));
    const first = pages[0] as (typeof pages)[number];
    queryClient.setQueryData<GalleryPages>(key, {
      ...data,
      pages: [
        { ...first, items: [image, ...first.items], total: first.total + (known ? 0 : 1) },
        ...pages.slice(1),
      ],
    });
    shown = true;
  }
  if (!shown) useLive.setState((st) => ({ galleryNew: st.galleryNew + 1 }));
  void queryClient.invalidateQueries({ queryKey: qk.galleryOverview(profileId) });
}

async function onBinary(data: ArrayBuffer): Promise<void> {
  const frame = decodePreviewFrame(data);
  if (!frame) return;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([frame.image as BlobPart], { type: frame.mime }));
  } catch {
    return;
  }
  const prev = useLive.getState().preview;
  useLive.setState({ preview: { jobSeq: frame.jobSeq, bitmap } });
  prev?.bitmap.close();
}
