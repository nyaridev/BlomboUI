/**
 * Server configuration from CLI flags. Paths are resolved once here; services receive the
 * config object instead of reaching for process.cwd().
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORTS } from "../shared/constants.ts";

export type OpenMode = "web" | "app" | "none";

export interface Flags {
  dev: boolean;
  port: number;
  open: OpenMode;
  dataDir?: string;
  runtimeDir?: string;
  civitaiUrl?: string;
  catalogUrl?: string;
  huggingfaceUrl?: string;
  fakeComfy?: boolean;
}

export interface ServerConfig {
  dev: boolean;
  host: string;
  port: number;
  open: OpenMode;
  version: string;
  root: string;
  dataDir: string;
  runtimeDir: string;
  clientDist: string;
  presetsDir: string;
  tauriExe: string;
  /**
   * A fixed Civitai address (`--civitai`: the fake one in tests and dev checks). Null: the
   * profile's setting picks civitai.com or civitai.red.
   */
  civitaiUrl: string | null;
  /** The ComfyUI model catalog (ComfyUI-Manager's model-list.json). */
  catalogUrl: string;
  /** The Hugging Face API's origin, for the catalog's download counts. */
  huggingfaceUrl: string | null;
  /**
   * Dev checks only: managed slots run the fake ComfyUI and custom node installs use fake
   * downloads and a fake uv (services/comfy/fixtures/).
   */
  fakeComfy: boolean;
}

export const CATALOG_URL =
  "https://raw.githubusercontent.com/Comfy-Org/ComfyUI-Manager/main/model-list.json";

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = { dev: false, port: PORTS.server, open: "none" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dev") flags.dev = true;
    else if (arg === "--port") flags.port = Number(argv[++i]) || PORTS.server;
    else if (arg === "--open") {
      const mode = argv[++i];
      if (mode === "web" || mode === "app" || mode === "none") flags.open = mode;
    } else if (arg === "--data") flags.dataDir = argv[++i];
    else if (arg === "--runtime") flags.runtimeDir = argv[++i];
    else if (arg === "--civitai") flags.civitaiUrl = argv[++i];
    else if (arg === "--catalog") flags.catalogUrl = argv[++i];
    else if (arg === "--huggingface") flags.huggingfaceUrl = argv[++i];
    else if (arg === "--fake-comfy") flags.fakeComfy = true;
  }
  return flags;
}

export function createConfig(flags: Flags): ServerConfig {
  const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
    version: string;
  };
  const exe = process.platform === "win32" ? "blombo-ui.exe" : "blombo-ui";
  return {
    dev: flags.dev,
    host: "127.0.0.1",
    port: flags.port,
    open: flags.open,
    version: pkg.version,
    root,
    dataDir: path.resolve(flags.dataDir ?? path.join(root, "data")),
    runtimeDir: path.resolve(flags.runtimeDir ?? path.join(root, "runtime")),
    clientDist: path.join(root, "dist", "client"),
    presetsDir: path.join(root, "presets"),
    tauriExe: path.join(root, "src-tauri", "target", "release", exe),
    civitaiUrl: flags.civitaiUrl?.replace(/\/+$/, "") ?? null,
    catalogUrl: flags.catalogUrl ?? CATALOG_URL,
    huggingfaceUrl: flags.huggingfaceUrl ?? null,
    fakeComfy: flags.dev && flags.fakeComfy === true,
  };
}
