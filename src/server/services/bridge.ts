/**
 * Round-trip editing with ComfyUI (ADR-0009). "Edit in ComfyUI" asks for an edit session: a
 * random token bound to one workflow of the open profile, valid for two hours. ComfyUI's page
 * (the blombo-bridge extension) loads the graph with it and saves back with it; every save uses
 * the token up and hands out the next one, so a token works once. Saving re-syncs the bindings
 * (workflows/resync.ts) and tells every Blombo window over the live bus.
 *
 * Only the ComfyUI the open profile uses may call /api/bridge from a browser (routes/bridge.ts
 * checks the Origin with `allowedOrigins()`).
 */
import { randomBytes } from "node:crypto";
import {
  BRIDGE_FOLDER,
  BRIDGE_SESSION_TTL_MS,
  BRIDGE_VERSION,
  type BridgeImportBody,
  type BridgeSaveBody,
  type BridgeSaveResult,
  type BridgeSession,
  type BridgeStatus,
  describeResync,
  type EditSession,
} from "../../shared/bridge.ts";
import type { ServerMessage } from "../../shared/live.ts";
import { UiGraph } from "../../shared/workflow/graph.ts";
import type { WorkflowManifest } from "../../shared/workflow/manifest.ts";
import { HttpError } from "../lib/http.ts";
import { findCustomNodes, installBridge } from "./comfy/bridge.ts";
import type { ComfySupervisor } from "./comfy/supervisor.ts";
import type { ProfileService } from "./profiles.ts";
import { analyze } from "./workflows/analyze.ts";
import { freeName } from "./workflows/bundle.ts";
import { apiToUi, applyWidgetValues } from "./workflows/convert.ts";
import { resync } from "./workflows/resync.ts";
import type { WorkflowService } from "./workflows/store.ts";

interface Session {
  workflowId: string;
  profileId: string;
  expires: number;
}

export interface BridgeDeps {
  workflows: WorkflowService;
  profiles: ProfileService;
  supervisor: Pick<ComfySupervisor, "status" | "objectInfo" | "api">;
  publish: (msg: ServerMessage) => void;
  /** Blombo's own address, as ComfyUI's page reaches it. */
  apiOrigin: string;
  /** src/comfy-bridge. */
  source: string;
  now?: () => number;
}

/** "http://127.0.0.1:8188" also as "http://localhost:8188" (and back). */
export function originVariants(url: string): string[] {
  try {
    const u = new URL(url);
    const out = new Set([u.origin]);
    const swap = {
      "127.0.0.1": "localhost",
      localhost: "127.0.0.1",
      "[::1]": "localhost",
    } as Record<string, string>;
    const other = swap[u.hostname];
    if (other) out.add(`${u.protocol}//${other}${u.port ? `:${u.port}` : ""}`);
    return [...out];
  } catch {
    return [];
  }
}

export class BridgeService {
  private readonly deps: BridgeDeps;
  private readonly sessions = new Map<string, Session>();

  constructor(deps: BridgeDeps) {
    this.deps = deps;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** Browser origins allowed to call /api/bridge: the open profile's ComfyUI. */
  allowedOrigins(): string[] {
    return originVariants(this.deps.supervisor.status().url);
  }

  /* ── status and install ─────────────────────────────────────────────────── */

  async status(): Promise<BridgeStatus> {
    const s = this.deps.supervisor.status();
    const base = { expected: BRIDGE_VERSION, mode: s.mode } as const;
    const api = this.deps.supervisor.api;
    if (!api)
      return {
        ...base,
        state: "unknown",
        version: null,
        message: "Start ComfyUI to check the bridge.",
      };
    let version: number | null = null;
    try {
      const res = await api.fetchRaw(`/extensions/${BRIDGE_FOLDER}/bridge.json`, 5000);
      if (res.ok) {
        const body = (await res.json()) as { version?: unknown };
        version = typeof body.version === "number" ? body.version : null;
      }
    } catch {
      // Not served: not loaded.
    }
    const restart =
      s.mode === "managed"
        ? "Restart ComfyUI to load it (Blombo already put it in this slot)."
        : "Install it again from Settings → ComfyUI, then restart ComfyUI.";
    if (version === null)
      return {
        ...base,
        state: "missing",
        version,
        message:
          s.mode === "managed"
            ? `The bridge isn't loaded yet. ${restart}`
            : "This ComfyUI doesn't have the bridge. Install it from Settings → ComfyUI, then restart ComfyUI.",
      };
    if (version < BRIDGE_VERSION)
      return {
        ...base,
        state: "outdated",
        version,
        message: `ComfyUI runs an older bridge (v${version}). ${restart}`,
      };
    return { ...base, state: "loaded", version, message: `Bridge v${version} is loaded.` };
  }

  /** Copy the bridge into a ComfyUI the user runs themselves. */
  async installInto(folder: string): Promise<{ path: string; result: string }> {
    const customNodes = await findCustomNodes(folder);
    const result = await installBridge(customNodes, {
      source: this.deps.source,
      api: this.deps.apiOrigin,
    });
    return { path: customNodes, result };
  }

  /* ── sessions ───────────────────────────────────────────────────────────── */

  private newToken(session: Session): string {
    const token = randomBytes(16).toString("base64url");
    this.sessions.set(token, session);
    return token;
  }

  private take(token: string, consume: boolean): Session {
    for (const [t, s] of this.sessions) if (s.expires < this.now()) this.sessions.delete(t);
    const session = this.sessions.get(token);
    if (!session)
      throw new HttpError(
        410,
        "This edit link was used or has expired. Open the workflow from Blombo again (Edit in ComfyUI).",
        "session_gone",
      );
    if (session.profileId !== this.deps.profiles.active)
      throw new HttpError(
        409,
        "Blombo has another profile open now. Open the profile this workflow belongs to, then try again.",
        "profile_changed",
      );
    if (consume) this.sessions.delete(token);
    return session;
  }

  async createSession(workflowId: string): Promise<EditSession> {
    const profileId = this.deps.profiles.active;
    if (!profileId) throw new HttpError(409, "Open a profile first.", "no_profile");
    await this.deps.workflows.get(workflowId);
    const status = await this.status();
    if (status.state === "unknown")
      throw new HttpError(409, "Start ComfyUI first, then open the workflow in it.", "comfy_down");
    if (status.state === "missing") throw new HttpError(409, status.message, "bridge_missing");
    const expires = this.now() + BRIDGE_SESSION_TTL_MS;
    const token = this.newToken({ workflowId, profileId, expires });
    const comfy = this.deps.supervisor.status().url.replace(/\/+$/, "");
    const q = new URLSearchParams({ blombo: token, blombo_api: this.deps.apiOrigin });
    return { token, url: `${comfy}/?${q.toString()}`, expiresAt: new Date(expires).toISOString() };
  }

  async session(token: string): Promise<BridgeSession> {
    const s = this.take(token, false);
    const manifest = await this.deps.workflows.get(s.workflowId);
    const info = await this.deps.supervisor.objectInfo();
    if (!info)
      throw new HttpError(
        409,
        "ComfyUI's node list isn't available. Try again in a moment.",
        "comfy_down",
      );
    let graph = await this.deps.workflows.graph(s.workflowId);
    if (!graph || !UiGraph.safeParse(graph).success)
      graph = apiToUi(await this.deps.workflows.prompt(s.workflowId), info);
    // The canvas shows the workflow's current values, not the ones it was imported with.
    graph = applyWidgetValues(
      graph,
      manifest.bindings
        .filter((b) => b.type !== "loras" && b.id in manifest.values)
        .map((b) => ({ node: b.node, input: b.input, value: manifest.values[b.id] })),
      info,
    );
    const profile = await this.deps.profiles.find(s.profileId);
    return {
      workflowId: manifest.id,
      name: manifest.name,
      graph,
      profileName: profile?.name ?? "",
    };
  }

  cancel(token: string): void {
    this.sessions.delete(token);
  }

  async save(token: string, body: BridgeSaveBody): Promise<BridgeSaveResult> {
    const s = this.take(token, true);
    try {
      const current = await this.deps.workflows.get(s.workflowId);
      const oldPrompt = await this.deps.workflows.prompt(s.workflowId);
      const info = await this.deps.supervisor.objectInfo();
      const r = resync(current, oldPrompt, body.output, info);
      let saved: WorkflowManifest;
      if (body.mode === "overwrite") {
        saved = await this.deps.workflows.replaceGraphs(s.workflowId, {
          prompt: body.output,
          graph: body.workflow,
          bindings: r.bindings,
          values: r.values,
          kind: r.kind,
        });
      } else {
        const taken = (await this.deps.workflows.list()).map((w) => w.name);
        const { format: _f, id: _id, createdAt: _c, updatedAt: _u, ...rest } = current;
        saved = await this.deps.workflows.create(
          {
            ...rest,
            name: freeName(`${current.name} copy`, taken).slice(0, 80),
            parentId: current.id,
            preset: null,
            kind: r.kind,
            bindings: r.bindings,
            values: r.values,
            prompt: body.output,
            graph: body.workflow,
            thumb: await this.deps.workflows.thumb(current.id),
          },
          undefined,
          `${current.name} copy`,
        );
      }
      const copy = body.mode === "copy";
      this.deps.publish({
        t: "workflow.saved",
        workflowId: saved.id,
        name: saved.name,
        created: copy,
        report: r.report,
      });
      // Further saves from this window go to what was just saved (the copy, after a copy).
      const next = this.newToken({
        workflowId: saved.id,
        profileId: s.profileId,
        expires: this.now() + BRIDGE_SESSION_TTL_MS,
      });
      const what = describeResync(r.report);
      return {
        workflowId: saved.id,
        name: saved.name,
        copy,
        report: r.report,
        next,
        message: copy ? `Saved as "${saved.name}". ${what}.` : `${what}.`,
      };
    } catch (error) {
      // The save didn't happen: the same token may try again.
      this.sessions.set(token, s);
      throw error;
    }
  }

  /** Send to Blombo: the canvas becomes a new workflow in the open profile. */
  async importCanvas(
    body: BridgeImportBody,
  ): Promise<{ workflowId: string; name: string; message: string }> {
    if (!this.deps.profiles.active)
      throw new HttpError(409, "Open a profile in Blombo first.", "no_profile");
    if (Object.keys(body.output).length === 0)
      throw new HttpError(400, "The canvas is empty. Add some nodes first.", "empty");
    const info = await this.deps.supervisor.objectInfo();
    const analysis = analyze(body.output, info);
    const taken = (await this.deps.workflows.list()).map((w) => w.name);
    const raw = (body.name ?? "From ComfyUI").replace(/\.json$/i, "").trim() || "From ComfyUI";
    const name = freeName(raw.slice(0, 80), taken);
    const workflow = await this.deps.workflows.create({
      name,
      kind: analysis.kind,
      family: "Imported",
      tags: ["imported"],
      parentId: null,
      preset: null,
      bindings: analysis.bindings,
      values: analysis.values,
      run: { seedMode: "random", count: 1 },
      stages: {},
      layout: null,
      prompt: body.output,
      graph: body.workflow,
    });
    this.deps.publish({
      t: "workflow.saved",
      workflowId: workflow.id,
      name: workflow.name,
      created: true,
      report: null,
    });
    const problems = analysis.findings.filter((f) => f.level !== "info").length;
    return {
      workflowId: workflow.id,
      name: workflow.name,
      message: `Added "${workflow.name}" to Blombo${problems ? ` (${problems} thing${problems === 1 ? "" : "s"} to check there)` : ""}.`,
    };
  }
}
