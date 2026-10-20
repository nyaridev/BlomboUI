/**
 * Putting blombo-bridge (src/comfy-bridge, ADR-0009) into a ComfyUI's custom_nodes/. Managed
 * slots get it before every start (copied only when the version or Blombo's address changed);
 * a ComfyUI the user runs gets it from Settings → ComfyUI → Install bridge, into the folder they
 * pick. Next to the extension Blombo writes web/bridge.json (the version, which Blombo reads
 * back through ComfyUI to tell whether it's loaded) and web/config.json (Blombo's address, for
 * Send to Blombo). Other files in the folder are left alone.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { BRIDGE_FOLDER, BRIDGE_VERSION } from "../../../shared/bridge.ts";
import { exists, writeFileAtomic, writeJsonAtomic } from "../../lib/fsx.ts";
import { HttpError } from "../../lib/http.ts";

/** Files copied from src/comfy-bridge (the .d.ts is only for Blombo's tests). */
const FILES = ["__init__.py", "web/blombo.js", "web/blombo-core.js"];

export type BridgeInstall = "installed" | "updated" | "current";

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Copy the extension into `<customNodes>/blombo-bridge` unless that copy is already current. */
export async function installBridge(
  customNodes: string,
  opts: { source: string; api: string },
): Promise<BridgeInstall> {
  const dest = path.join(customNodes, BRIDGE_FOLDER);
  const meta = await readJson(path.join(dest, "web", "bridge.json"));
  const config = await readJson(path.join(dest, "web", "config.json"));
  if (meta?.version === BRIDGE_VERSION && config?.api === opts.api) return "current";
  const fresh = !(await exists(dest));
  for (const rel of FILES)
    await writeFileAtomic(path.join(dest, rel), await fs.readFile(path.join(opts.source, rel)));
  await writeJsonAtomic(path.join(dest, "web", "config.json"), { api: opts.api });
  await writeJsonAtomic(path.join(dest, "web", "bridge.json"), { version: BRIDGE_VERSION });
  return fresh ? "installed" : "updated";
}

/**
 * The custom_nodes folder for a folder the user picked: ComfyUI's own folder, its custom_nodes,
 * or a portable build's folder (ComfyUI_windows_portable/ComfyUI/custom_nodes).
 */
export async function findCustomNodes(folder: string): Promise<string> {
  const root = path.resolve(folder);
  const candidates = [
    path.basename(root).toLowerCase() === "custom_nodes" ? root : null,
    path.join(root, "custom_nodes"),
    path.join(root, "ComfyUI", "custom_nodes"),
  ].filter((p): p is string => p !== null);
  for (const dir of candidates) {
    const stat = await fs.stat(dir).catch(() => null);
    if (stat?.isDirectory()) return dir;
  }
  throw new HttpError(
    400,
    "That folder isn't a ComfyUI folder (no custom_nodes inside). Pick the folder that has ComfyUI's main.py, or its custom_nodes folder.",
    "not_comfy",
  );
}
