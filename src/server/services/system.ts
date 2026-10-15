/**
 * System helpers that must behave the same in browser and desktop mode: native folder
 * picker (runs on the server, so it works without Tauri IPC) and path inspection for the
 * profile wizard.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { CheckPathResult } from "../../shared/profile.ts";

/** ComfyUI model folder names we look for to recognize a models root. */
const MODEL_FOLDERS = [
  "checkpoints",
  "diffusion_models",
  "unet",
  "loras",
  "vae",
  "text_encoders",
  "clip",
  "upscale_models",
  "controlnet",
  "embeddings",
  "sams",
  "ultralytics",
];

export async function checkPath(raw: string): Promise<CheckPathResult> {
  const target = raw.trim() ? path.resolve(raw.trim()) : "";
  const result: CheckPathResult = {
    path: target,
    exists: false,
    isDirectory: false,
    writable: false,
    modelFolders: [],
  };
  if (!target) return result;
  try {
    const stat = await fs.stat(target);
    result.exists = true;
    result.isDirectory = stat.isDirectory();
  } catch {
    return result;
  }
  if (!result.isDirectory) return result;
  try {
    await fs.access(target, fs.constants.W_OK);
    result.writable = true;
  } catch {
    result.writable = false;
  }
  try {
    const entries = await fs.readdir(target, { withFileTypes: true });
    const names = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase()));
    result.modelFolders = MODEL_FOLDERS.filter((name) => names.has(name));
  } catch {
    // Unreadable folder: report what we know.
  }
  return result;
}

/**
 * Opens the OS folder dialog and resolves with the chosen path, or null when cancelled.
 * Windows uses PowerShell's FolderBrowserDialog; Linux tries zenity.
 */
export function pickFolder(title: string, initial?: string): Promise<string | null> {
  return new Promise((resolve) => {
    let command: string;
    let args: string[];
    if (process.platform === "win32") {
      const esc = (s: string) => s.replace(/'/g, "''");
      const script = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
        `$d.Description = '${esc(title)}'`,
        "$d.UseDescriptionForTitle = $true",
        initial ? `$d.SelectedPath = '${esc(initial)}'` : "",
        "$f = New-Object System.Windows.Forms.Form -Property @{TopMost=$true; ShowInTaskbar=$false}",
        "if ($d.ShowDialog($f) -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }",
      ]
        .filter(Boolean)
        .join("; ");
      command = "powershell.exe";
      args = ["-NoProfile", "-STA", "-Command", script];
    } else {
      command = "zenity";
      args = ["--file-selection", "--directory", `--title=${title}`];
    }
    const child = spawn(command, args, { windowsHide: true });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("error", () => resolve(null));
    child.on("close", () => resolve(out.trim() || null));
  });
}

/**
 * Show a file in the OS file manager (Explorer selects it). Callers pass paths they resolved
 * themselves from their own data, never a path straight from a request.
 */
export function revealInFileManager(target: string): Promise<void> {
  return new Promise((resolve) => {
    const child =
      process.platform === "win32"
        ? spawn("explorer.exe", [`/select,${target}`], { windowsHide: false, detached: true })
        : spawn("xdg-open", [path.dirname(target)], { detached: true, stdio: "ignore" });
    child.on("error", () => resolve());
    child.unref();
    // explorer.exe exits with 1 even when it worked; don't wait for it.
    setTimeout(resolve, 50);
  });
}
