/**
 * BlomboUI server entry. Runs directly on Node (native TypeScript type stripping):
 *
 *   node src/server/main.ts [--dev] [--port 4380] [--open web|app|none] [--data <dir>]
 *
 *   --dev    dev mode (Vite serves the client on :4382 and proxies /api here)
 *   --open   web → default browser, app → Tauri window, none → nothing
 *   --data   profiles folder (default ./data)
 */
import { serve } from "@hono/node-server";
import { APP_NAME, PORTS } from "../shared/constants.ts";
import { createApp } from "./app.ts";
import { createConfig, parseFlags } from "./config.ts";
import { ProfileService } from "./services/profiles.ts";
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
  if (config.open === "app") openInAppWindow(config, url);
}

const profiles = new ProfileService(config);
const app = createApp({ config, profiles });

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () => {
  const mode = config.dev ? "dev" : config.open === "app" ? "app" : "web";
  console.log(`\n  ✦ ${APP_NAME} ${config.version} (${mode})`);
  console.log(`  ✦ Data: ${config.dataDir}`);
  if (config.dev) console.log(`  ✦ API on ${url}. Open http://127.0.0.1:${PORTS.devWeb}\n`);
  else console.log(`  ✦ Open ${url}\n`);
  openWindow();
});

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

const shutdown = () => {
  server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
