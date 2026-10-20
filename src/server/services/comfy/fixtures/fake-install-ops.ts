/**
 * Fake network and processes for installers, used by the server's `--fake-comfy` dev flag:
 * GitHub source zips are made up on the spot (a custom node with an __init__.py and a
 * requirements.txt), and uv only prints what it would do, a little slowly so progress shows.
 * Nothing is downloaded and no Python package is installed.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import type { InstallOps } from "../installer.ts";
import { UV_WINDOWS } from "../uv.ts";

const enc = (s: string) => new TextEncoder().encode(s);

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("Stopped."));
      },
      { once: true },
    );
  });
}

export function fakeInstallOps(stepMs = 250): InstallOps {
  return {
    // Not win32: uv is "on PATH", so nothing downloads uv either.
    platform: "linux",
    uv: UV_WINDOWS,
    async download(url, dest, onProgress, signal) {
      for (let i = 1; i <= 8; i++) {
        await wait(stepMs, signal);
        onProgress(i / 8);
      }
      // https://github.com/<owner>/<repo>/archive/<ref>.zip
      const [, , , , repo = "pack", , file = "ref.zip"] = url.split("/");
      const top = `${repo}-${file.replace(/\.zip$/, "")}`;
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(
        dest,
        zipSync({
          [`${top}/__init__.py`]: enc("NODE_CLASS_MAPPINGS = {}  # fake pack\n"),
          [`${top}/requirements.txt`]: enc("fake-package\n"),
        }),
      );
    },
    async run(_command, args, opts) {
      if (args[1] === "freeze") {
        opts.onLine("torch==2.8.0+cu128");
        return 0;
      }
      if (args[1] === "install") {
        for (const pkg of ["fake-package", "fake-dependency", "another-one"]) {
          opts.onLine(`Downloading ${pkg} (1.2MiB)`);
          await wait(stepMs * 2, opts.signal);
          opts.onLine(`Downloaded ${pkg}`);
        }
        opts.onLine("Installed 3 packages (fake)");
      }
      return 0;
    },
    async release() {
      throw new Error("The fake installer doesn't install ComfyUI slots.");
    },
  };
}
