import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, pickApi, readParams, toGraphs } from "../../comfy-bridge/web/blombo-core.js";
import type { ComfyStatus } from "../../shared/comfy.ts";
import type { ServerMessage } from "../../shared/live.ts";
import { type ApiPrompt, ObjectInfo } from "../../shared/workflow/graph.ts";
import { createConfig, parseFlags } from "../config.ts";
import { HttpError } from "../lib/http.ts";
import { bridgeRoutes } from "../routes/bridge.ts";
import { BridgeService, originVariants } from "./bridge.ts";
import { installBridge } from "./comfy/bridge.ts";
import type { ComfyClient } from "./comfy/client.ts";
import { type FakeComfy, startFakeComfy } from "./comfy/fixtures/fake-comfy.ts";
import { ProfileService } from "./profiles.ts";
import { installPreset } from "./workflows/presets.ts";
import { WorkflowService } from "./workflows/store.ts";

const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "blombo-bridge-"));
const config = createConfig(
  parseFlags(["--data", path.join(tmp, "data"), "--runtime", path.join(tmp, "runtime")]),
);
const customNodes = path.join(tmp, "ComfyUI", "custom_nodes");
const source = path.join(config.root, "src", "comfy-bridge");
const info = ObjectInfo.parse(
  JSON.parse(
    fs.readFileSync(
      path.join(config.root, "src/server/services/workflows/fixtures/object_info.json"),
      "utf8",
    ),
  ),
);

let fake: FakeComfy;
const profiles = new ProfileService(config);
const workflows = new WorkflowService(profiles);
const published: ServerMessage[] = [];
let bridge: BridgeService;
let app: Hono;
let origin = "";

beforeAll(async () => {
  fs.mkdirSync(customNodes, { recursive: true });
  fake = await startFakeComfy(0, 1, null, customNodes);
  origin = fake.url;
  const p = await profiles.create({
    name: "Bridge",
    accent: "blue",
    theme: "blombo",
    paths: { models: "", outputs: "", wildcards: "" },
    comfy: { mode: "external", url: fake.url },
    presets: [],
  });
  await profiles.open(p.id);
  const api = { fetchRaw: (p: string) => fetch(`${fake.url}${p}`) } as unknown as ComfyClient;
  bridge = new BridgeService({
    workflows,
    profiles,
    supervisor: {
      status: () => ({ url: fake.url, mode: "external" }) as ComfyStatus,
      objectInfo: async () => info,
      api,
    },
    publish: (m) => published.push(m),
    apiOrigin: "http://blombo.test",
    source,
  });
  app = new Hono();
  app.onError((e, c) =>
    e instanceof HttpError
      ? c.json({ error: e.message, code: e.code }, e.status)
      : c.text(String(e), 500),
  );
  app.route("/api/bridge", bridgeRoutes(bridge));
});

afterAll(async () => {
  await fake.close();
  await fsp.rm(tmp, { recursive: true, force: true });
});

/** fetch() into the Hono app, as ComfyUI's page would call Blombo (with its Origin). */
const fromComfy = (url: string, init?: RequestInit) =>
  app.fetch(
    new Request(url, { ...init, headers: { ...(init?.headers ?? {}), origin } }),
  ) as Promise<Response>;

describe("installing the bridge", () => {
  it("copies the extension once and rewrites it when Blombo's address changes", async () => {
    expect(await installBridge(customNodes, { source, api: "http://blombo.test" })).toBe(
      "installed",
    );
    expect(await installBridge(customNodes, { source, api: "http://blombo.test" })).toBe("current");
    expect(await installBridge(customNodes, { source, api: "http://other.test" })).toBe("updated");
    await installBridge(customNodes, { source, api: "http://blombo.test" });
    const dir = path.join(customNodes, "blombo-bridge");
    expect(fs.existsSync(path.join(dir, "__init__.py"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "web", "blombo.js"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "web", "blombo-core.d.ts"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "web", "config.json"), "utf8"))).toEqual({
      api: "http://blombo.test",
    });
  });

  it("is seen as loaded through ComfyUI, which lists its script", async () => {
    expect((await bridge.status()).state).toBe("loaded");
    const list = (await (await fetch(`${fake.url}/extensions`)).json()) as string[];
    expect(list).toContain("/extensions/blombo-bridge/blombo.js");
  });
});

describe("an edit session", () => {
  it("loads the graph, saves back with values kept, and hands out a new token each save", async () => {
    const wf = await installPreset(config.presetsDir, workflows, "sd15");
    await workflows.patchValues(wf.id, { values: { "sampler.steps": 37 } });

    const session = await bridge.createSession(wf.id);
    expect(session.url.startsWith(`${fake.url}/?blombo=`)).toBe(true);
    const params = readParams(new URL(session.url).search);
    expect(params).toEqual({ token: session.token, api: "http://blombo.test" });

    const client = createClient("http://blombo.test", fromComfy);
    const loaded = await client.session(session.token);
    expect(loaded.name).toBe("SD 1.5");
    // The canvas shows the workflow's value (37 steps), not the preset's.
    const sampler = (
      loaded.graph as { nodes: Array<{ type: string; widgets_values: unknown[] }> }
    ).nodes.find((n) => n.type === "KSampler");
    expect(sampler?.widgets_values).toContain(37);

    // The user adds a $-titled node in ComfyUI and saves.
    // What ComfyUI sends back: the canvas as it was opened (with the workflow's values)…
    const output: ApiPrompt = structuredClone(await workflows.prompt(wf.id));
    const current = await workflows.get(wf.id);
    for (const b of current.bindings) {
      const node = output[b.node];
      if (node && b.id in current.values && b.type !== "loras")
        node.inputs[b.input] = current.values[b.id];
    }
    output["50"] = {
      class_type: "ImageSharpen",
      inputs: { image: ["8", 0], sharpen_radius: 1, sigma: 1, alpha: 0.5 },
      _meta: { title: "$Sharpen" },
    };
    const graphs = toGraphs({ workflow: { nodes: [], links: [] }, output });
    const saved = await client.save(session.token, graphs, "overwrite");
    expect(saved.message).toBe("3 new parameters.");
    expect(saved.next).toBeTruthy();
    const after = await workflows.get(wf.id);
    expect(after.values["sampler.steps"]).toBe(37);
    expect(after.bindings.some((b) => b.id === "n50.sigma")).toBe(true);
    expect(published.at(-1)).toMatchObject({
      t: "workflow.saved",
      workflowId: wf.id,
      created: false,
    });
    // The old version went to the trash.
    const trash = path.join(workflows.root(), "..", "trash", "workflows");
    expect(fs.readdirSync(trash).some((n) => n.startsWith(`${wf.id}-before-edit-`))).toBe(true);

    // The used token is gone; the next one saves a copy.
    await expect(client.session(session.token)).rejects.toThrow(/used or has expired/);
    const copy = await client.save(saved.next as string, graphs, "copy");
    expect(copy.name).toBe("SD 1.5 copy");
    const copied = await workflows.get(copy.workflowId);
    expect(copied.parentId).toBe(wf.id);
    expect(copied.values["sampler.steps"]).toBe(37);
  });

  it("Send to Blombo adds the canvas as a new workflow", async () => {
    const client = createClient("http://blombo.test", fromComfy);
    const output = structuredClone(await workflows.prompt("sd15"));
    const res = await client.send({ workflow: { nodes: [], links: [] }, output }, "night.json");
    expect(res.name).toBe("night");
    expect((await workflows.get(res.workflowId)).tags).toContain("imported");
  });
});

describe("CORS on /api/bridge", () => {
  it("answers only the profile's ComfyUI", async () => {
    const ok = await fromComfy("http://blombo.test/api/bridge/session/nope-nope-nope-nope");
    expect(ok.status).toBe(410);
    // The error still carries the header, so the extension can read Blombo's message.
    expect(ok.headers.get("access-control-allow-origin")).toBe(origin);

    const evil = await app.fetch(
      new Request("http://blombo.test/api/bridge/import", {
        method: "POST",
        headers: { origin: "http://evil.example", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();

    const pre = await fromComfy("http://blombo.test/api/bridge/import", { method: "OPTIONS" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("treats localhost and 127.0.0.1 as the same ComfyUI", () => {
    expect(originVariants("http://127.0.0.1:8188/")).toEqual([
      "http://127.0.0.1:8188",
      "http://localhost:8188",
    ]);
  });
});

describe("bridge: which Blombo it talks to", () => {
  it("believes an address in the link only when it's on this computer", () => {
    expect(pickApi("http://127.0.0.1:4381", "http://127.0.0.1:4380")).toBe("http://127.0.0.1:4381");
    expect(pickApi("http://localhost:4380", null)).toBe("http://localhost:4380");
    expect(pickApi("https://evil.example", "http://127.0.0.1:4380")).toBe("http://127.0.0.1:4380");
    expect(pickApi("https://evil.example", null)).toBeNull();
    expect(pickApi(null, "http://127.0.0.1:4380")).toBe("http://127.0.0.1:4380");
  });
});
