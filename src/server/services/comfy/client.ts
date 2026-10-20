/**
 * Talks to one ComfyUI: its HTTP API and the single WebSocket the server holds (ADR-0008).
 * The socket reconnects with backoff while `connect()` is in effect and reports open/close, so
 * the supervisor can turn connection changes into a status.
 *
 * ComfyUI's binary frames: [u32 event][payload]. Event 1 = preview ([u32 image type][bytes]),
 * event 4 = preview with metadata ([u32 json length][json][bytes]). Announcing the
 * `supports_preview_metadata` feature flag makes ComfyUI send event 4, which names the prompt.
 */
import WebSocket from "ws";
import { Emitter } from "../../lib/emitter.ts";

export interface ComfyWsMessage {
  type: string;
  data: Record<string, unknown>;
}

export interface ComfyPreview {
  /** 1 = JPEG, 2 = PNG (ComfyUI's numbering, also used by the live bus). */
  kind: 1 | 2;
  image: Uint8Array;
  promptId: string | null;
  node: string | null;
}

type ClientEvents = {
  open: () => void;
  close: () => void;
  message: (msg: ComfyWsMessage) => void;
  preview: (preview: ComfyPreview) => void;
};

/** Error from ComfyUI's HTTP API, with its JSON body when it sent one. */
export class ComfyHttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];

export class ComfyClient extends Emitter<ClientEvents> {
  readonly baseUrl: string;
  readonly clientId: string;
  private ws: WebSocket | null = null;
  private wanted = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isOpen = false;

  constructor(baseUrl: string, clientId: string) {
    super();
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.clientId = clientId;
  }

  get connected(): boolean {
    return this.isOpen;
  }

  /* ── WebSocket ─────────────────────────────────────────────────────────── */

  connect(): void {
    this.wanted = true;
    if (!this.ws) this.open();
  }

  disconnect(): void {
    this.wanted = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.removeAllListeners();
      ws.on("error", () => undefined);
      ws.terminate();
    }
    this.setOpen(false);
  }

  /** Reconnect now instead of waiting for the next backoff step. */
  reconnect(): void {
    this.attempt = 0;
    this.disconnect();
    this.connect();
  }

  private open(): void {
    const wsUrl = `${this.baseUrl.replace(/^http/, "ws")}/ws?clientId=${encodeURIComponent(this.clientId)}`;
    const ws = new WebSocket(wsUrl, { handshakeTimeout: 4000 });
    this.ws = ws;
    ws.binaryType = "nodebuffer";
    ws.on("open", () => {
      this.attempt = 0;
      ws.send(JSON.stringify({ type: "feature_flags", data: { supports_preview_metadata: true } }));
      this.setOpen(true);
    });
    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) this.onBinary(data);
      else this.onText(data.toString("utf8"));
    });
    ws.on("error", () => undefined);
    ws.on("close", () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setOpen(false);
      if (!this.wanted) return;
      const delay = BACKOFF_MS[Math.min(this.attempt++, BACKOFF_MS.length - 1)];
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.wanted && !this.ws) this.open();
      }, delay);
    });
  }

  private setOpen(open: boolean): void {
    if (this.isOpen === open) return;
    this.isOpen = open;
    this.emit(open ? "open" : "close");
  }

  private onText(text: string): void {
    try {
      const msg = JSON.parse(text) as ComfyWsMessage;
      if (msg && typeof msg.type === "string")
        this.emit("message", { type: msg.type, data: (msg.data ?? {}) as Record<string, unknown> });
    } catch {
      // Not JSON: ignore rather than drop the connection.
    }
  }

  private onBinary(buf: Buffer): void {
    if (buf.byteLength < 8) return;
    const event = buf.readUInt32BE(0);
    if (event === 1) {
      const type = buf.readUInt32BE(4);
      const kind = type === 2 ? 2 : 1;
      this.emit("preview", { kind, image: buf.subarray(8), promptId: null, node: null });
    } else if (event === 4) {
      const len = buf.readUInt32BE(4);
      if (buf.byteLength < 8 + len) return;
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(buf.subarray(8, 8 + len).toString("utf8")) as Record<string, unknown>;
      } catch {
        return;
      }
      const kind = meta.image_type === "image/png" ? 2 : 1;
      const node = meta.display_node_id ?? meta.node_id;
      this.emit("preview", {
        kind,
        image: buf.subarray(8 + len),
        promptId: typeof meta.prompt_id === "string" ? meta.prompt_id : null,
        node: node === undefined || node === null ? null : String(node),
      });
    }
  }

  /* ── HTTP ──────────────────────────────────────────────────────────────── */

  async request<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
    timeoutMs = 15_000,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ComfyHttpError(
        0,
        `ComfyUI at ${this.baseUrl} didn't answer (${describe(error)}).`,
        null,
      );
    }
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Plain-text response (e.g. 200 "") is fine.
    }
    if (!res.ok) throw new ComfyHttpError(res.status, `ComfyUI answered ${res.status}.`, data);
    return data as T;
  }

  /** Raw response for streaming files through (images from /view). */
  async fetchRaw(path: string, timeoutMs = 30_000): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  }

  systemStats(timeoutMs = 3000) {
    return this.request<ComfySystemStats>("GET", "/system_stats", undefined, timeoutMs);
  }

  objectInfo() {
    return this.request<unknown>("GET", "/object_info", undefined, 60_000);
  }

  queuePrompt(prompt: unknown, extraData: Record<string, unknown> = {}) {
    return this.request<{ prompt_id: string; number: number; node_errors?: unknown }>(
      "POST",
      "/prompt",
      { prompt, client_id: this.clientId, extra_data: extraData },
    );
  }

  /** Put an image into ComfyUI's input folder (LoadImage reads it as "<subfolder>/<name>"). */
  async uploadImage(
    bytes: Uint8Array,
    name: string,
    subfolder: string,
  ): Promise<{ name: string; subfolder: string }> {
    const form = new FormData();
    form.set("image", new Blob([bytes as Uint8Array<ArrayBuffer>]), name);
    form.set("subfolder", subfolder);
    form.set("type", "input");
    form.set("overwrite", "true");
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/upload/image`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      throw new ComfyHttpError(
        0,
        `ComfyUI at ${this.baseUrl} didn't answer (${describe(error)}).`,
        null,
      );
    }
    const body = (await res.json().catch(() => null)) as {
      name?: string;
      subfolder?: string;
    } | null;
    if (!res.ok || !body?.name)
      throw new ComfyHttpError(res.status, `ComfyUI didn't take the image (${res.status}).`, body);
    return { name: body.name, subfolder: body.subfolder ?? "" };
  }

  interrupt(promptId?: string) {
    return this.request<unknown>("POST", "/interrupt", promptId ? { prompt_id: promptId } : {});
  }

  deleteQueued(promptIds: string[]) {
    return this.request<unknown>("POST", "/queue", { delete: promptIds });
  }

  /** Ids of the prompts ComfyUI is running or has waiting. */
  async queue(): Promise<Set<string>> {
    const body = await this.request<{ queue_running?: unknown[][]; queue_pending?: unknown[][] }>(
      "GET",
      "/queue",
    );
    const ids = new Set<string>();
    for (const entry of [...(body.queue_running ?? []), ...(body.queue_pending ?? [])])
      if (Array.isArray(entry) && typeof entry[1] === "string") ids.add(entry[1]);
    return ids;
  }

  history(promptId: string) {
    return this.request<Record<string, ComfyHistoryEntry>>(
      "GET",
      `/history/${encodeURIComponent(promptId)}`,
    );
  }

  free(unloadModels: boolean, freeMemory: boolean) {
    return this.request<unknown>("POST", "/free", {
      unload_models: unloadModels,
      free_memory: freeMemory,
    });
  }
}

export interface ComfySystemStats {
  system?: { comfyui_version?: string; os?: string; python_version?: string };
  devices?: Array<{
    name?: string;
    type?: string;
    vram_total?: number;
    vram_free?: number;
  }>;
}

export interface ComfyHistoryEntry {
  outputs?: Record<
    string,
    { images?: Array<{ filename: string; subfolder?: string; type?: string }> }
  >;
  status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: { code?: string } }).cause;
    if (cause?.code) return cause.code;
    if (error.name === "TimeoutError") return "timed out";
    return error.message;
  }
  return String(error);
}
