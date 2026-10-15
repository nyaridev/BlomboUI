/**
 * Managed ComfyUI slots: runtime/comfyui/<slot>/ holds a ComfyUI checkout and its own Python.
 *
 *   runtime/comfyui/<slot>/
 *   ├── ComfyUI/main.py
 *   ├── python_embeded/python.exe   (portable build) or python/, .venv/, venv/
 *   └── blombo/                     files Blombo writes: extra_model_paths.yaml, comfy.pid
 *
 * Installing slots (downloading ComfyUI and Torch) is installer.ts's job; this module only finds
 * what's there. A slot with blombo/installing in it is unfinished and isn't started.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { exists } from "../../lib/fsx.ts";

export interface SlotLayout {
  slot: string;
  dir: string;
  comfyDir: string;
  main: string;
  python: string;
  /** Blombo's own files for this slot. */
  stateDir: string;
  /** PyTorch build the installer put in (blombo/slot.json); null for slots made by hand. */
  torch: "cuda" | "cpu" | null;
}

export type SlotLookup = { ok: true; layout: SlotLayout } | { ok: false; reason: string };

const PYTHONS =
  process.platform === "win32"
    ? [
        "python_embeded/python.exe",
        "python_embedded/python.exe",
        "python/python.exe",
        ".venv/Scripts/python.exe",
        "venv/Scripts/python.exe",
        "ComfyUI/.venv/Scripts/python.exe",
        "ComfyUI/venv/Scripts/python.exe",
      ]
    : [
        ".venv/bin/python",
        "venv/bin/python",
        "ComfyUI/.venv/bin/python",
        "ComfyUI/venv/bin/python",
      ];

export const SLOT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function slotsRoot(runtimeDir: string): string {
  return path.join(runtimeDir, "comfyui");
}

export async function findSlot(runtimeDir: string, slot: string): Promise<SlotLookup> {
  if (!SLOT_NAME.test(slot)) return { ok: false, reason: `"${slot}" isn't a valid slot name.` };
  const dir = path.join(slotsRoot(runtimeDir), slot);
  if (!(await exists(dir)))
    return {
      ok: false,
      reason: `ComfyUI slot "${slot}" isn't installed yet. Install it in Settings → ComfyUI, or point the profile at a ComfyUI you run yourself.`,
    };
  if (await exists(path.join(dir, "blombo", "installing")))
    return {
      ok: false,
      reason: `ComfyUI slot "${slot}" isn't finished installing. Open Settings → ComfyUI to finish the install.`,
    };
  const comfyDir = path.join(dir, "ComfyUI");
  const main = path.join(comfyDir, "main.py");
  if (!(await exists(main)))
    return { ok: false, reason: `Slot "${slot}" has no ComfyUI/main.py. Reinstall the slot.` };
  for (const rel of PYTHONS) {
    const python = path.join(dir, rel);
    if (await exists(python)) {
      const stateDir = path.join(dir, "blombo");
      return {
        ok: true,
        layout: { slot, dir, comfyDir, main, python, stateDir, torch: await slotTorch(stateDir) },
      };
    }
  }
  return {
    ok: false,
    reason: `Slot "${slot}" has no Python next to ComfyUI (python_embeded, python, .venv or venv). Reinstall the slot.`,
  };
}

async function slotTorch(stateDir: string): Promise<SlotLayout["torch"]> {
  try {
    const meta = JSON.parse(await fs.readFile(path.join(stateDir, "slot.json"), "utf8")) as {
      variant?: unknown;
    };
    return meta.variant === "cpu" || meta.variant === "cuda" ? meta.variant : null;
  } catch {
    return null;
  }
}

/** Installed slot names (folders with ComfyUI/main.py that aren't mid-install). */
export async function listSlots(runtimeDir: string): Promise<string[]> {
  const root = slotsRoot(runtimeDir);
  let entries: string[] = [];
  try {
    entries = (await fs.readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries)
    if (
      (await exists(path.join(root, name, "ComfyUI", "main.py"))) &&
      !(await exists(path.join(root, name, "blombo", "installing")))
    )
      out.push(name);
  return out.sort();
}
