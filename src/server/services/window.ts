/**
 * Opening the UI: default browser (start-web) or the Tauri window (start-app).
 * The Tauri binary is a thin shell around this server; closing it stops the server.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import open from "open";
import type { ServerConfig } from "../config.ts";

export async function openInBrowser(url: string): Promise<void> {
  try {
    await open(url);
  } catch (error) {
    console.warn(`Could not open a browser automatically. Visit ${url} (${String(error)})`);
  }
}

export function openInAppWindow(config: ServerConfig, url: string): void {
  if (!existsSync(config.tauriExe)) {
    console.warn("The desktop app is not built yet (run start-app.bat). Opening the browser.");
    void openInBrowser(url);
    return;
  }
  const child = spawn(config.tauriExe, ["--url", url], { stdio: "inherit", windowsHide: false });
  child.on("exit", (code) => {
    console.log(`App window closed (${code ?? 0}). Stopping BlomboUI.`);
    process.exit(0);
  });
  child.on("error", (error) => {
    console.warn(`Could not start the app window: ${String(error)}. Opening the browser.`);
    void openInBrowser(url);
  });
}
