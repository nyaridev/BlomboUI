/**
 * The live bus (ADR-0008): every window holds one WebSocket at /api/live. Services publish
 * typed messages to a topic; the bus fans them out to the windows subscribed to it. Preview
 * frames are binary and are dropped for a window whose socket is backed up, so a slow window
 * never makes the server buffer images.
 */
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { ClientMessage, type LiveTopic, type ServerMessage } from "../../shared/live.ts";
import { Emitter } from "../lib/emitter.ts";

interface Peer {
  ws: WebSocket;
  topics: Set<LiveTopic>;
  visible: boolean;
  alive: boolean;
}

type BusEvents = {
  /** Number of visible windows changed between zero and non-zero. */
  visible: (any: boolean) => void;
  /** Whether any window follows the `logs` topic. */
  logs: (any: boolean) => void;
};

/** Above this many queued bytes a window skips preview frames until it catches up. */
const BACKPRESSURE_BYTES = 2 * 1024 * 1024;
const PING_MS = 30_000;

/** Only pages served from this machine may connect (blocks cross-site WebSocket hijacking). */
export function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return (
      host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "tauri.localhost"
    );
  } catch {
    return false;
  }
}

export class LiveBus extends Emitter<BusEvents> {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  private readonly peers = new Set<Peer>();
  private readonly hello: () => ServerMessage;
  private ping: ReturnType<typeof setInterval> | null = null;
  private anyVisible = false;
  private anyLogs = false;

  constructor(hello: () => ServerMessage) {
    super();
    this.hello = hello;
  }

  /** Handle upgrades for `path` on the HTTP server. */
  attach(server: Pick<Server, "on">, path = "/api/live"): void {
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== path) return;
      if (!isLocalOrigin(req.headers.origin)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.add(ws));
    });
    this.ping = setInterval(() => {
      for (const peer of this.peers) {
        if (!peer.alive) {
          peer.ws.terminate();
          continue;
        }
        peer.alive = false;
        peer.ws.ping();
      }
    }, PING_MS);
    this.ping.unref();
  }

  close(): void {
    if (this.ping) clearInterval(this.ping);
    for (const peer of this.peers) peer.ws.close(1001, "Server is shutting down");
    this.wss.close();
  }

  get size(): number {
    return this.peers.size;
  }

  /** Send to every window subscribed to `topic`; `null` sends to all windows. */
  publish(topic: LiveTopic | null, msg: ServerMessage): void {
    if (this.peers.size === 0) return;
    const text = JSON.stringify(msg);
    for (const peer of this.peers)
      if ((topic === null || peer.topics.has(topic)) && peer.ws.readyState === WebSocket.OPEN)
        peer.ws.send(text);
  }

  publishBinary(topic: LiveTopic, frame: Uint8Array): void {
    for (const peer of this.peers) {
      if (!peer.topics.has(topic) || peer.ws.readyState !== WebSocket.OPEN) continue;
      if (peer.ws.bufferedAmount > BACKPRESSURE_BYTES) continue;
      peer.ws.send(frame, { binary: true });
    }
  }

  private add(ws: WebSocket): void {
    const peer: Peer = { ws, topics: new Set(), visible: true, alive: true };
    this.peers.add(peer);
    ws.on("pong", () => {
      peer.alive = true;
    });
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      let parsed: ReturnType<typeof ClientMessage.safeParse>;
      try {
        parsed = ClientMessage.safeParse(JSON.parse(data.toString()));
      } catch {
        return;
      }
      if (!parsed.success) return;
      const msg = parsed.data;
      if (msg.t === "subscribe") for (const t of msg.topics) peer.topics.add(t);
      else if (msg.t === "unsubscribe") for (const t of msg.topics) peer.topics.delete(t);
      else peer.visible = msg.visible;
      this.recount();
    });
    ws.on("close", () => {
      this.peers.delete(peer);
      this.recount();
    });
    ws.on("error", () => undefined);
    ws.send(JSON.stringify(this.hello()));
    this.recount();
  }

  private recount(): void {
    let visible = false;
    let logs = false;
    for (const peer of this.peers) {
      if (peer.visible && peer.topics.has("system")) visible = true;
      if (peer.topics.has("logs")) logs = true;
    }
    if (visible !== this.anyVisible) {
      this.anyVisible = visible;
      this.emit("visible", visible);
    }
    if (logs !== this.anyLogs) {
      this.anyLogs = logs;
      this.emit("logs", logs);
    }
  }
}
