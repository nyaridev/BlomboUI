/**
 * The live bus client (ADR-0008): one WebSocket per window at /api/live, reconnecting with
 * backoff. Messages land in the `useLive` store; components select the smallest slice they
 * need (a progress number, the ComfyUI state), so a progress tick never re-renders the queue.
 * Preview frames are decoded off the main paint with createImageBitmap.
 */
import type { ComfyLogLine, ComfyStatus, SystemStats } from "@shared/comfy";
import type { JobProgress, QueueSnapshot } from "@shared/jobs";
import {
  type AppError,
  type ClientMessage,
  decodePreviewFrame,
  type LiveTopic,
  ServerMessage,
} from "@shared/live";
import { create } from "zustand";
import { qk, queryClient } from "./queries";

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
}));

const BASE_TOPICS: LiveTopic[] = ["comfy", "system", "jobs"];
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
      break;
    case "comfy.status": {
      const wasRunning = s.comfy?.state === "running";
      useLive.setState({ comfy: msg.status });
      // Fresh model lists and choices once ComfyUI (re)connects.
      if (msg.status.state === "running" && !wasRunning) {
        void queryClient.invalidateQueries({ queryKey: qk.modelsAll });
        void queryClient.invalidateQueries({ queryKey: ["workflow"] });
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
      break;
  }
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
