import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import type { NodeInstallState } from "../../../shared/install.ts";
import type { NodePack } from "../../../shared/workflow/stages.ts";
import type { InstallOps } from "./installer.ts";
import { externalHowTo, type NodePackComfy, NodePackInstaller, packFolder } from "./nodepacks.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-nodepacks-"));
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

const enc = (s: string) => new TextEncoder().encode(s);
const REF_A = "a".repeat(40);
const REF_B = "b".repeat(40);

const IMPACT: NodePack = {
  name: "ComfyUI Impact Pack",
  url: "https://github.com/ltdrdata/ComfyUI-Impact-Pack",
  ref: REF_A,
  nodes: ["FaceDetailer", "SAMLoader"],
};
const SUBPACK: NodePack = {
  name: "ComfyUI Impact Subpack",
  url: "https://github.com/ltdrdata/ComfyUI-Impact-Subpack",
  ref: REF_B,
  nodes: ["UltralyticsDetectorProvider"],
};
const UNPINNED: NodePack = {
  name: "Something",
  url: "https://github.com/someone/something",
  nodes: ["Thing"],
};

/** A managed slot with ComfyUI, a venv Python and uv already in runtime/tools. */
async function makeRuntime(name: string): Promise<{ runtime: string; comfyDir: string }> {
  const runtime = path.join(tmp, name);
  const slot = path.join(runtime, "comfyui", "s1");
  const comfyDir = path.join(slot, "ComfyUI");
  await fs.mkdir(path.join(comfyDir, "custom_nodes"), { recursive: true });
  await fs.writeFile(path.join(comfyDir, "main.py"), "");
  for (const py of [".venv/Scripts/python.exe", ".venv/bin/python"]) {
    await fs.mkdir(path.dirname(path.join(slot, py)), { recursive: true });
    await fs.writeFile(path.join(slot, py), "");
  }
  await fs.mkdir(path.join(runtime, "tools", "uv"), { recursive: true });
  await fs.writeFile(path.join(runtime, "tools", "uv", "uv.exe"), "");
  return { runtime, comfyDir };
}

/** Fake GitHub zips and a fake uv: records what ran, never touches the network or pip. */
function fakeOps(opts: { failPip?: string; hang?: boolean } = {}) {
  const calls: string[] = [];
  const ops: InstallOps = {
    platform: "win32",
    async download(url, dest, onProgress) {
      calls.push(`download ${url}`);
      const repo = url.split("/")[4] ?? "x";
      const ref = (url.split("/").pop() ?? "").replace(".zip", "");
      await fs.mkdir(path.dirname(dest), { recursive: true });
      onProgress(0.5);
      await fs.writeFile(
        dest,
        zipSync({
          [`${repo}-${ref}/__init__.py`]: enc("NODE_CLASS_MAPPINGS = {}"),
          [`${repo}-${ref}/requirements.txt`]: enc("ultralytics"),
          [`${repo}-${ref}/modules/a.py`]: enc(""),
        }),
      );
      onProgress(1);
    },
    async release() {
      throw new Error("not used");
    },
    async run(command, args, o) {
      calls.push(`run ${path.basename(command)} ${args.slice(0, 2).join(" ")}`);
      if (args[1] === "freeze") {
        o.onLine("numpy==2.1.0");
        o.onLine("torch==2.8.0+cu128");
        o.onLine("torchvision==0.23.0+cu128");
        return 0;
      }
      if (args[1] === "install") {
        calls.push(`  -r ${path.basename(path.dirname(args[5] ?? ""))} -c ${args.includes("-c")}`);
        o.onLine("Downloading ultralytics (1.0MiB)");
        if (opts.hang)
          await new Promise<void>((_, reject) => {
            // Stopped before it got here: the abort event has already fired.
            if (o.signal.aborted) reject(new Error("stopped"));
            o.signal.addEventListener("abort", () => reject(new Error("stopped")));
          });
        o.onLine("Downloaded ultralytics");
        if (opts.failPip && args[5]?.includes(opts.failPip)) return 2;
      }
      return 0;
    },
  };
  return { ops, calls };
}

/** A fake ComfyUI that loads the packs' nodes when it starts after they're installed. */
function fakeComfy(comfyDir: string, opts: { mode?: "external"; running?: boolean } = {}) {
  const events: string[] = [];
  let running = opts.running ?? true;
  let loaded: string[] = [];
  const comfy: NodePackComfy = {
    target: () =>
      opts.mode === "external"
        ? { mode: "external", url: "http://127.0.0.1:8188" }
        : { mode: "managed", slot: "s1" },
    running: () => running,
    async stop() {
      events.push("stop");
      running = false;
    },
    async startAndWait() {
      events.push("start");
      running = true;
      loaded = await fs.readdir(path.join(comfyDir, "custom_nodes"));
      return true;
    },
    async objectInfo() {
      const info: Record<string, unknown> = { KSampler: {} };
      if (loaded.includes("ComfyUI-Impact-Pack")) info.FaceDetailer = info.SAMLoader = {};
      if (loaded.includes("ComfyUI-Impact-Subpack")) info.UltralyticsDetectorProvider = {};
      return info as never;
    },
  };
  return { comfy, events };
}

function finished(installer: NodePackInstaller): Promise<NodeInstallState> {
  return new Promise((resolve) => {
    const off = installer.on("state", (s) => {
      if (s.state !== "running") {
        off();
        resolve(s);
      }
    });
  });
}

function make(
  runtime: string,
  comfy: NodePackComfy,
  ops: InstallOps,
  blocked: string | null = null,
) {
  return new NodePackInstaller({
    runtimeDir: runtime,
    comfy,
    ops,
    known: async () => [IMPACT, SUBPACK, UNPINNED],
    blocked: () => blocked,
  });
}

describe("NodePackInstaller", () => {
  it("downloads pinned packs, installs their packages with torch pinned, restarts and checks", async () => {
    const { runtime, comfyDir } = await makeRuntime("full");
    const { ops, calls } = fakeOps();
    const { comfy, events } = fakeComfy(comfyDir);
    const installer = make(runtime, comfy, ops);
    const done = finished(installer);
    await installer.start([IMPACT.url, SUBPACK.url]);
    const state = await done;

    expect(state.state).toBe("done");
    expect(state.error).toBeNull();
    expect(state.steps.map((s) => [s.id, s.state])).toEqual([
      ["download:ComfyUI-Impact-Pack", "done"],
      ["download:ComfyUI-Impact-Subpack", "done"],
      ["stop", "done"],
      ["packages:ComfyUI-Impact-Pack", "done"],
      ["packages:ComfyUI-Impact-Subpack", "done"],
      ["restart", "done"],
      ["verify", "done"],
    ]);
    expect(calls).toContain(`download ${IMPACT.url}/archive/${REF_A}.zip`);
    expect(calls.filter((c) => c.includes("-r "))).toEqual([
      "  -r ComfyUI-Impact-Pack -c true",
      "  -r ComfyUI-Impact-Subpack -c true",
    ]);
    // Stopped before pip (Windows file locks), started once after.
    expect(events).toEqual(["stop", "start"]);
    const pack = path.join(comfyDir, "custom_nodes", "ComfyUI-Impact-Pack");
    expect(await fs.readFile(path.join(pack, "__init__.py"), "utf8")).toContain("NODE_CLASS");
    expect(await fs.stat(path.join(pack, "modules", "a.py"))).toBeTruthy();
    const slot = path.dirname(comfyDir);
    const constraints = await fs.readFile(path.join(slot, "blombo", "constraints.txt"), "utf8");
    expect(constraints.split("\n").filter(Boolean)).toEqual([
      "torch==2.8.0+cu128",
      "torchvision==0.23.0+cu128",
    ]);
    const record = JSON.parse(await fs.readFile(path.join(slot, "blombo", "packs.json"), "utf8"));
    expect(record["ComfyUI-Impact-Pack"]).toMatchObject({ url: IMPACT.url, ref: REF_A });
    // Nothing left half-unpacked, and the zip is gone.
    expect(await fs.readdir(path.join(slot, "blombo", "tmp"))).toEqual([]);
    expect(await fs.readdir(path.join(runtime, "tools", "downloads"))).toEqual([]);
  });

  it("keeps a pack that's already there (any Manager spelling) and only installs its packages", async () => {
    const { runtime, comfyDir } = await makeRuntime("existing");
    const mine = path.join(comfyDir, "custom_nodes", "comfyui-impact-pack");
    await fs.mkdir(mine);
    await fs.writeFile(path.join(mine, "__init__.py"), "# mine");
    await fs.writeFile(path.join(mine, "requirements.txt"), "piexif");
    const { ops, calls } = fakeOps();
    const { comfy } = fakeComfy(comfyDir, { running: false });
    const installer = make(runtime, comfy, ops);
    const done = finished(installer);
    await installer.start([IMPACT.url]);
    const state = await done;

    expect(state.state).toBe("done");
    expect(state.steps[0]).toMatchObject({ state: "skipped", detail: "Already in custom_nodes" });
    expect(calls.some((c) => c.startsWith("download"))).toBe(false);
    expect(calls).toContain("  -r comfyui-impact-pack -c true");
    expect(await fs.readFile(path.join(mine, "__init__.py"), "utf8")).toBe("# mine");
    // ComfyUI was stopped: no restart, and the page says when the nodes load.
    expect(state.steps.map((s) => s.id)).not.toContain("restart");
    expect(state.note).toMatch(/next time it starts/);
  });

  it("reports a failed package install and starts ComfyUI again", async () => {
    const { runtime, comfyDir } = await makeRuntime("failpip");
    const { ops } = fakeOps({ failPip: "Subpack" });
    const { comfy, events } = fakeComfy(comfyDir);
    const installer = make(runtime, comfy, ops);
    const done = finished(installer);
    await installer.start([IMPACT.url, SUBPACK.url]);
    const state = await done;

    expect(state.state).toBe("error");
    expect(state.error).toMatch(/exit code 2/);
    expect(state.steps.find((s) => s.id === "packages:ComfyUI-Impact-Subpack")?.state).toBe(
      "error",
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual(["stop", "start"]);
  });

  it("says which pack ComfyUI didn't load", async () => {
    const { runtime, comfyDir } = await makeRuntime("noload");
    const { ops } = fakeOps();
    const { comfy } = fakeComfy(comfyDir);
    comfy.objectInfo = async () => ({ KSampler: {} }) as never;
    const installer = make(runtime, comfy, ops);
    const done = finished(installer);
    await installer.start([IMPACT.url]);
    const state = await done;
    expect(state.state).toBe("error");
    expect(state.error).toMatch(/didn't load ComfyUI Impact Pack/);
    expect(state.steps.at(-1)).toMatchObject({ id: "verify", state: "error" });
  });

  it("can be cancelled, and installing again resumes with the pack already there", async () => {
    const { runtime, comfyDir } = await makeRuntime("cancel");
    const hang = fakeOps({ hang: true });
    const { comfy, events } = fakeComfy(comfyDir);
    const installer = make(runtime, comfy, hang.ops);
    const done = finished(installer);
    await installer.start([IMPACT.url]);
    // Cancel while the packages install (ComfyUI is stopped by then), however slow the machine.
    for (let i = 0; i < 400 && !hang.calls.some((c) => c.includes("-r ")); i++)
      await new Promise((r) => setTimeout(r, 10));
    installer.cancel();
    const state = await done;
    expect(state.state).toBe("cancelled");
    expect(state.error).toMatch(/Install again/);
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual(["stop", "start"]);

    const again = fakeOps();
    const second = make(runtime, comfy, again.ops);
    const done2 = finished(second);
    await second.start([IMPACT.url]);
    expect((await done2).state).toBe("done");
    expect(again.calls.some((c) => c.startsWith("download"))).toBe(false);
  });

  it("refuses unknown or unpinned packs, external ComfyUIs, a busy queue and a second install", async () => {
    const { runtime, comfyDir } = await makeRuntime("refuse");
    const { ops } = fakeOps({ hang: true });
    const { comfy } = fakeComfy(comfyDir);
    const installer = make(runtime, comfy, ops);
    await expect(installer.start(["https://github.com/evil/pack"])).rejects.toMatchObject({
      status: 400,
    });
    await expect(installer.start([UNPINNED.url])).rejects.toMatchObject({ status: 400 });

    const external = make(runtime, fakeComfy(comfyDir, { mode: "external" }).comfy, ops);
    await expect(external.start([IMPACT.url])).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("ComfyUI Impact Pack"),
    });

    const busy = make(runtime, comfy, ops, "Wait for the queue to finish.");
    await expect(busy.start([IMPACT.url])).rejects.toMatchObject({ status: 409 });

    await installer.start([IMPACT.url]);
    await expect(installer.start([SUBPACK.url])).rejects.toMatchObject({ status: 409 });
    const done = finished(installer);
    installer.cancel();
    await done;
  });
});

describe("pack helpers", () => {
  it("names the folder after the repository unless the package says otherwise", () => {
    expect(packFolder(IMPACT)).toBe("ComfyUI-Impact-Pack");
    expect(packFolder({ ...IMPACT, folder: "impact" })).toBe("impact");
  });

  it("tells external users what to install", () => {
    expect(externalHowTo([IMPACT, SUBPACK])).toMatch(
      /Install ComfyUI Impact Pack, ComfyUI Impact Subpack there/,
    );
  });
});
