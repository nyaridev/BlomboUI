/**
 * BlomboUI server entry. Runs directly on Node (native TypeScript type stripping):
 *
 *   node src/server/main.ts [--dev] [--port 4380] [--open web|app|none] [--data <dir>]
 *                           [--runtime <dir>]
 *
 *   --dev    dev mode (Vite serves the client on :4382 and proxies /api here)
 *   --open   web → default browser, app → Tauri window, none → nothing
 *   --data     profiles folder (default ./data)
 *   --runtime  ComfyUI slots, tools and caches (default ./runtime)
 */
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { APP_NAME, PORTS } from "../shared/constants.ts";
import { createApp } from "./app.ts";
import { createConfig, parseFlags } from "./config.ts";
import { createServices } from "./context.ts";
import { openInAppWindow, openInBrowser } from "./services/window.ts";

const config = createConfig(parseFlags(process.argv.slice(2)));
const url = `http://${config.host}:${config.port}`;

async function isBlomboRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/system`, { signal: AbortSignal.timeout(1500) });
    return res.ok && ((await res.json()) as { app?: string }).app === APP_NAME;
  } catch {
    return false;
  }
}

function openWindow(): void {
  if (config.open === "web") void openInBrowser(url);
  if (config.open === "app") openInAppWindow(config, url, () => shutdown());
}

const services = createServices(config);
const app = createApp(services);

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () => {
  const mode = config.dev ? "dev" : config.open === "app" ? "app" : "web";
  console.log(`\n  ✦ ${APP_NAME} ${config.version} (${mode})`);
  console.log(`  ✦ Data: ${config.dataDir}`);
  if (config.dev) console.log(`  ✦ API on ${url}. Open http://127.0.0.1:${PORTS.devWeb}\n`);
  else console.log(`  ✦ Open ${url}\n`);
  openWindow();
});
// serve() returns a plain HTTP server here (no TLS / HTTP2 options are passed).
services.bus.attach(server as Server);

server.on("error", async (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE" && (await isBlomboRunning())) {
    console.log(`${APP_NAME} is already running on ${url}. Opening it.`);
    openWindow();
    if (config.open !== "app") setTimeout(() => process.exit(0), 1500);
    return;
  }
  console.error(`Could not start the server: ${error.message}`);
  process.exit(1);
});

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  server.close();
  // Give ComfyUI a moment to stop (it's left running in dev so models stay loaded).
  const force = setTimeout(() => process.exit(0), 8000);
  void services.shutdown().finally(() => {
    clearTimeout(force);
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
