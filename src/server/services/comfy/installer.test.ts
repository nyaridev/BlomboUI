import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import type { InstallState } from "../../../shared/install.ts";
import { stripAnsi } from "../../lib/ansi.ts";
import { ComfyInstaller, extractTopFolder, type InstallOps } from "./installer.ts";
import { findSlot } from "./slots.ts";
import { slotCacheEnv, uvEnv } from "./uv.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-install-"));
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

const enc = (s: string) => new TextEncoder().encode(s);

/** Fake network and processes: downloads write fixture zips, `uv venv` makes a python.exe. */
function fakeOps(opts: { failTorch?: boolean; hang?: boolean } = {}) {
  const calls: string[] = [];
  const ops: InstallOps = {
    platform: "win32",
    async download(url, dest, onProgress) {
      calls.push(`download ${url.includes("uv-") ? "uv" : "comfy"}`);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      const zip = url.includes("uv-")
        ? zipSync({ "uv.exe": enc("uv"), "uvx.exe": enc("uvx"), "README.md": enc("x") })
        : zipSync({
            "ComfyUI-0.9.9/main.py": enc("print('hi')"),
            "ComfyUI-0.9.9/requirements.txt": enc("numpy"),
            "ComfyUI-0.9.9/comfy/__init__.py": enc(""),
          });
      onProgress(0.5);
      await fs.writeFile(dest, zip);
      onProgress(1);
    },
    async release(version) {
      calls.push(`release ${version}`);
      return { tag: "v0.9.9", zip: "https://example.invalid/comfy.zip" };
    },
    async run(command, args, o) {
      const what = path.basename(command) === "uv.exe" ? args.slice(0, 2).join(" ") : "python";
      calls.push(`run ${what}`);
      if (args[0] === "venv") {
        const py = path.join(args[3] ?? "", "Scripts", "python.exe");
        await fs.mkdir(path.dirname(py), { recursive: true });
        await fs.writeFile(py, "");
      }
      if (args.includes("torch")) {
        o.onLine("Downloading torch (2.3GiB)");
        if (opts.hang)
          await new Promise<void>((_, reject) =>
            o.signal.addEventListener("abort", () => reject(new Error("stopped"))),
          );
        o.onLine("Downloaded torch");
        if (opts.failTorch) return 1;
      }
      if (what === "python") o.onLine("2.8.0+cu128 True");
      return 0;
    },
  };
  return { ops, calls };
}

function waitFor(
  installer: ComfyInstaller,
  states: InstallState["state"][],
): Promise<InstallState> {
  return new Promise((resolve) => {
    const off = installer.on("state", (s) => {
      if (states.includes(s.state)) {
        off();
        resolve(s);
      }
    });
  });
}

describe("ComfyUI installer", () => {
  it("installs a slot the supervisor can start", async () => {
    const runtime = path.join(tmp, "a");
    const { ops, calls } = fakeOps();
    const installer = new ComfyInstaller(runtime, ops);
    const installed: string[] = [];
    installer.on("installed", (slot) => installed.push(slot));
    const done = waitFor(installer, ["done", "error"]);
    await installer.start({ slot: "latest", torch: "cuda", version: "latest" });
    const state = await done;
    expect(state.error).toBeNull();
    expect(state.state).toBe("done");
    expect(state.version).toBe("v0.9.9");
    expect(state.steps.every((s) => s.state === "done")).toBe(true);
    expect(installed).toEqual(["latest"]);
    expect(calls).toEqual([
      "download uv",
      "run venv --python",
      "release latest",
      "download comfy",
      "run pip install",
      "run pip install",
      "run python",
    ]);
    const lookup = await findSlot(runtime, "latest");
    expect(lookup.ok).toBe(true);
    const meta = JSON.parse(
      await fs.readFile(path.join(runtime, "comfyui", "latest", "blombo", "slot.json"), "utf8"),
    );
    expect(meta).toMatchObject({ comfyui: "v0.9.9", torch: "2.8.0+cu128", variant: "cuda" });
    await expect(
      installer.start({ slot: "latest", torch: "cuda", version: "latest" }),
    ).rejects.toThrow(/already installed/);
  });

  it("stops on a failed step, keeps the slot unfinished and resumes", async () => {
    const runtime = path.join(tmp, "b");
    const failing = fakeOps({ failTorch: true });
    const installer = new ComfyInstaller(runtime, failing.ops);
    const failed = waitFor(installer, ["done", "error"]);
    await installer.start({ slot: "s1", torch: "cpu", version: "v0.9.9" });
    const state = await failed;
    expect(state.state).toBe("error");
    expect(state.error).toMatch(/Installing packages failed/);
    expect(state.steps.find((s) => s.id === "torch")?.state).toBe("error");
    expect(state.log).toContain("Downloading torch (2.3GiB)");
    const lookup = await findSlot(runtime, "s1");
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) expect(lookup.reason).toMatch(/isn't finished installing/);

    const retry = fakeOps();
    const again = new ComfyInstaller(runtime, retry.ops);
    const done = waitFor(again, ["done", "error"]);
    await again.start({ slot: "s1", torch: "cpu", version: "v0.9.9" });
    const resumed = await done;
    expect(resumed.state).toBe("done");
    expect(resumed.steps.filter((s) => s.state === "skipped").map((s) => s.id)).toEqual([
      "python",
      "comfyui",
    ]);
    expect(retry.calls).not.toContain("download comfy");
    expect((await findSlot(runtime, "s1")).ok).toBe(true);
  });

  it("can be cancelled", async () => {
    const runtime = path.join(tmp, "c");
    const { ops } = fakeOps({ hang: true });
    const installer = new ComfyInstaller(runtime, ops);
    const torchStarted = new Promise<void>((resolve) => {
      const off = installer.on("state", (s) => {
        if (s.log.some((l) => l.startsWith("Downloading torch"))) {
          off();
          resolve();
        }
      });
    });
    const stopped = waitFor(installer, ["cancelled", "error", "done"]);
    await installer.start({ slot: "s2", torch: "cuda", version: "latest" });
    await torchStarted;
    installer.cancel();
    const state = await stopped;
    expect(state.state).toBe("cancelled");
    expect(state.error).toMatch(/continue where it left off/);
  });

  it("keeps the slot's library caches and settings inside runtime/", () => {
    const runtime = path.join(tmp, "rt");
    const env = slotCacheEnv(runtime);
    for (const key of [
      "HF_HOME",
      "TORCH_HOME",
      "YOLO_CONFIG_DIR",
      "TRANSPARENT_BACKGROUND_FILE_PATH",
    ])
      expect(path.relative(runtime, env[key] as string).startsWith("..")).toBe(false);
    expect(uvEnv(runtime).HF_HOME).toBe(env.HF_HOME);
  });

  it("strips terminal color codes", () => {
    expect(stripAnsi("\x1b[2mPrepared \x1b[1m14 packages\x1b[0m")).toBe("Prepared 14 packages");
  });

  it("strips the top folder of a source zip", async () => {
    const zip = path.join(tmp, "src.zip");
    await fs.writeFile(zip, zipSync({ "Top-1/a.txt": enc("a"), "Top-1/d/b.txt": enc("b") }));
    const dest = path.join(tmp, "out");
    await extractTopFolder(zip, dest);
    expect(await fs.readFile(path.join(dest, "d", "b.txt"), "utf8")).toBe("b");
  });

  it("never writes outside the folder, whichever separator a zip entry uses", async () => {
    const zip = path.join(tmp, "evil.zip");
    await fs.writeFile(
      zip,
      zipSync({
        "Top-1/ok.txt": enc("ok"),
        "Top-1/..\\..\\escaped.txt": enc("x"),
        "Top-1/../../escaped2.txt": enc("x"),
        "Top-1/C:\\escaped3.txt": enc("x"),
      }),
    );
    const dest = path.join(tmp, "out-evil");
    await extractTopFolder(zip, dest);
    expect(await fs.readFile(path.join(dest, "ok.txt"), "utf8")).toBe("ok");
    expect(await fs.readdir(dest)).toEqual(["ok.txt"]);
    for (const name of ["escaped.txt", "escaped2.txt", "escaped3.txt"])
      await expect(fs.stat(path.join(tmp, name))).rejects.toThrow();
  });
});
