import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { ComfyState } from "../../../shared/comfy.ts";
import { Profile } from "../../../shared/profile.ts";
import { startFakeComfy } from "./fixtures/fake-comfy.ts";
import { extraModelPathsYaml } from "./paths.ts";
import { findSlot } from "./slots.ts";
import { ComfySupervisor, findFreePort, type SupervisorOptions } from "./supervisor.ts";

const fake = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-comfy.ts");
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-comfy-"));
const runtimeDir = path.join(tmp, "runtime");
const modelsDir = path.join(tmp, "models");
const supervisors: ComfySupervisor[] = [];

afterAll(async () => {
  for (const s of supervisors) await s.stop().catch(() => undefined);
  await fs.rm(tmp, { recursive: true, force: true });
});

async function makeSlot(slot: string) {
  const dir = path.join(runtimeDir, "comfyui", slot);
  await fs.mkdir(path.join(dir, "ComfyUI"), { recursive: true });
  await fs.writeFile(path.join(dir, "ComfyUI", "main.py"), "");
  const py =
    process.platform === "win32"
      ? path.join(dir, "python", "python.exe")
      : path.join(dir, ".venv", "bin", "python");
  await fs.mkdir(path.dirname(py), { recursive: true });
  await fs.writeFile(py, "");
}

function profile(comfy: Profile["comfy"]): Profile {
  return Profile.parse({
    id: "t",
    name: "T",
    createdAt: new Date().toISOString(),
    paths: { models: modelsDir, outputs: "", wildcards: "" },
    comfy,
  });
}

async function supervisor(extra: Partial<SupervisorOptions> = {}) {
  const s = new ComfySupervisor({
    runtimeDir,
    keepAlive: false,
    preferredPort: await findFreePort(18_000 + Math.floor(Math.random() * 2000)),
    // The fake server stands in for `python -s ComfyUI/main.py …`.
    launch: (layout, args) => ({
      command: process.execPath,
      args: [fake, ...args.slice(2)],
      cwd: layout.dir,
    }),
    ...extra,
  });
  supervisors.push(s);
  return s;
}

function until(s: ComfySupervisor, state: ComfyState, ms = 15_000): Promise<void> {
  if (s.status().state === state) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`still ${s.status().state}, wanted ${state}`)), ms);
    const off = s.on("status", (st) => {
      if (st.state !== state) return;
      clearTimeout(t);
      off();
      resolve();
    });
  });
}

describe("extraModelPathsYaml", () => {
  it("points every model folder at the profile's models root", () => {
    const yaml = extraModelPathsYaml("D:\\AI\\Models") ?? "";
    expect(yaml).toContain("base_path: D:/AI/Models");
    expect(yaml).toContain("is_default: true");
    expect(yaml).toMatch(/diffusion_models: \|-?\n\s+diffusion_models\n\s+unet/);
    expect(extraModelPathsYaml("  ")).toBeNull();
  });
});

describe("findSlot", () => {
  it("explains what's missing", async () => {
    expect(await findSlot(runtimeDir, "absent")).toMatchObject({ ok: false });
    expect(await findSlot(runtimeDir, "../escape")).toMatchObject({ ok: false });
    await makeSlot("found");
    const found = await findSlot(runtimeDir, "found");
    expect(found.ok && found.layout.slot).toBe("found");
    expect(found.ok && found.layout.torch).toBeNull();
  });

  it("reads the PyTorch build the installer recorded", async () => {
    await makeSlot("cpu-slot");
    await fs.mkdir(path.join(runtimeDir, "comfyui", "cpu-slot", "blombo"), { recursive: true });
    await fs.writeFile(
      path.join(runtimeDir, "comfyui", "cpu-slot", "blombo", "slot.json"),
      JSON.stringify({ variant: "cpu" }),
    );
    const found = await findSlot(runtimeDir, "cpu-slot");
    expect(found.ok && found.layout.torch).toBe("cpu");
  });
});

describe("managed slot", () => {
  it("starts, reports running with logs, writes model paths and stops", async () => {
    await makeSlot("main");
    const s = await supervisor();
    await s.applyProfile(profile({ mode: "managed", slot: "main" }));
    await until(s, "running");
    expect(s.status()).toMatchObject({ mode: "managed", slot: "main", version: "0.0.0-fake" });
    expect(s.status().pid).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 200));
    expect(s.logs().some((l) => l.text.includes("To see the GUI"))).toBe(true);
    const yaml = await fs.readFile(
      path.join(runtimeDir, "comfyui", "main", "blombo", "extra_model_paths.yaml"),
      "utf8",
    );
    expect(yaml).toContain(modelsDir.replace(/\\/g, "/"));
    expect(await s.objectInfo()).toHaveProperty("KSampler");
    // Its temp folder exists, so Python's tempfile doesn't fall back to the system temp.
    expect((await fs.stat(path.join(runtimeDir, "cache", "comfy", "tmp"))).isDirectory()).toBe(
      true,
    );

    await s.stop();
    expect(s.status()).toMatchObject({ state: "stopped", pid: null });
  });

  it("notices a crash", async () => {
    await makeSlot("crashy");
    const s = await supervisor();
    await s.applyProfile(profile({ mode: "managed", slot: "crashy" }));
    await until(s, "running");
    process.kill(s.status().pid ?? 0);
    await until(s, "crashed");
    expect(s.status().message).toMatch(/stopped unexpectedly/);
  });

  it("re-adopts a ComfyUI left running by a previous server (dev keep-alive)", async () => {
    await makeSlot("kept");
    const first = await supervisor({ keepAlive: true });
    await first.applyProfile(profile({ mode: "managed", slot: "kept" }));
    await until(first, "running");
    const pid = first.status().pid;
    await first.shutdown();

    const second = await supervisor();
    await second.applyProfile(profile({ mode: "managed", slot: "kept" }));
    await until(second, "running");
    expect(second.status().pid).toBe(pid);
    await second.stop();
    expect(second.status().state).toBe("stopped");
  });

  it("reports a missing slot instead of starting", async () => {
    const s = await supervisor();
    await s.applyProfile(profile({ mode: "managed", slot: "not-installed" }));
    expect(s.status()).toMatchObject({ state: "missing" });
    expect(s.status().message).toMatch(/isn't installed/);
  });
});

describe("external ComfyUI", () => {
  it("connects, notices when it goes away and reconnects", async () => {
    const port = await findFreePort(20_500);
    let server = await startFakeComfy(port);
    const s = await supervisor();
    await s.applyProfile(profile({ mode: "external", url: server.url }));
    await until(s, "running");
    await expect(s.stop()).resolves.toMatchObject({ state: "running" });

    await server.close();
    await until(s, "unreachable");
    server = await startFakeComfy(port);
    await until(s, "running", 20_000);

    // Switching the profile to a managed slot lets go of the external ComfyUI.
    await s.applyProfile(profile({ mode: "managed", slot: "not-installed" }));
    expect(s.status()).toMatchObject({ mode: "managed", state: "missing" });
    expect(s.api).toBeNull();
    await server.close();
  });
});
