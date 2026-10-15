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
}

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
  };
}
