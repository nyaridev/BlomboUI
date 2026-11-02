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
 * PowerShell reads the dialog's title and starting folder from environment variables, never
 * from the script text: quoting can't be escaped reliably (PowerShell also ends strings at curly
 * quotes), and these values come from requests. Output is UTF-8 so any folder name comes back.
 */
const PS_PRELUDE = [
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
  "Add-Type -AssemblyName System.Windows.Forms",
];
const pickerEnv = (vars: Record<string, string>) => ({ ...process.env, ...vars });

/**
 * The modern Windows folder dialog (Explorer-style, with the address bar): IFileOpenDialog in
 * folder mode. Windows PowerShell runs .NET Framework, whose FolderBrowserDialog is the old tree
 * dialog, so the COM interface is declared here (compiled by Add-Type, about 0.2 s).
 */
const FOLDER_PICKER_CS = `using System;
using System.Runtime.InteropServices;
public static class BlomboFolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialogRCW {}
  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr hwndOwner);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
  }
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
  }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid, out IShellItem ppv);

  public static string Pick(string title, string initial, IntPtr owner) {
    var dlg = (IFileOpenDialog)new FileOpenDialogRCW();
    uint opts;
    dlg.GetOptions(out opts);
    // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST
    dlg.SetOptions(opts | 0x20 | 0x40 | 0x800);
    if (!String.IsNullOrEmpty(title)) dlg.SetTitle(title);
    if (!String.IsNullOrEmpty(initial)) {
      try {
        Guid iid = typeof(IShellItem).GUID;
        IShellItem folder;
        SHCreateItemFromParsingName(initial, IntPtr.Zero, ref iid, out folder);
        dlg.SetFolder(folder);
      } catch { }
    }
    if (dlg.Show(owner) != 0) return null;
    IShellItem item;
    dlg.GetResult(out item);
    string path;
    item.GetDisplayName(0x80058000, out path); // SIGDN_FILESYSPATH
    return path;
  }
}`;

/**
 * Opens the OS folder dialog and resolves with the chosen path, or null when cancelled.
 * Windows uses the modern folder dialog (FOLDER_PICKER_CS); Linux tries zenity.
 */
export function pickFolder(title: string, initial?: string): Promise<string | null> {
  return new Promise((resolve) => {
    let command: string;
    let args: string[];
    let env: NodeJS.ProcessEnv | undefined;
    if (process.platform === "win32") {
      const script = [
        ...PS_PRELUDE,
        `Add-Type -TypeDefinition @'\n${FOLDER_PICKER_CS}\n'@`,
        // A hidden topmost window owns the dialog, so it opens in front of the browser.
        "$f = New-Object System.Windows.Forms.Form -Property @{TopMost=$true; ShowInTaskbar=$false}",
        "$p = [BlomboFolderPicker]::Pick($env:BLOMBO_PICK_TITLE, $env:BLOMBO_PICK_INITIAL, $f.Handle)",
        "if ($p) { [Console]::Out.Write($p) }",
      ].join("\n");
      env = pickerEnv({ BLOMBO_PICK_TITLE: title, BLOMBO_PICK_INITIAL: initial ?? "" });
      command = "powershell.exe";
      args = ["-NoProfile", "-STA", "-Command", script];
    } else {
      command = "zenity";
      args = ["--file-selection", "--directory", `--title=${title}`];
    }
    const child = spawn(command, args, { windowsHide: true, env });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("error", () => resolve(null));
    child.on("close", () => resolve(out.trim() || null));
  });
}

/**
 * Opens the OS file dialog for several images and resolves with their paths (empty when
 * cancelled). Windows uses PowerShell's OpenFileDialog; Linux tries zenity.
 */
export function pickImages(title: string): Promise<string[]> {
  return new Promise((resolve) => {
    let command: string;
    let args: string[];
    let env: NodeJS.ProcessEnv | undefined;
    if (process.platform === "win32") {
      const script = [
        ...PS_PRELUDE,
        "$d = New-Object System.Windows.Forms.OpenFileDialog",
        "$d.Title = $env:BLOMBO_PICK_TITLE",
        "$d.Multiselect = $true",
        "$d.Filter = 'Images|*.png;*.jpg;*.jpeg;*.webp;*.bmp|All files|*.*'",
        "$f = New-Object System.Windows.Forms.Form -Property @{TopMost=$true; ShowInTaskbar=$false}",
        "if ($d.ShowDialog($f) -eq 'OK') { [Console]::Out.Write(($d.FileNames -join \"`n\")) }",
      ].join("; ");
      env = pickerEnv({ BLOMBO_PICK_TITLE: title });
      command = "powershell.exe";
      args = ["-NoProfile", "-STA", "-Command", script];
    } else {
      command = "zenity";
      args = ["--file-selection", "--multiple", "--separator=\n", `--title=${title}`];
    }
    const child = spawn(command, args, { windowsHide: true, env });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("error", () => resolve([]));
    child.on("close", () =>
      resolve(
        out
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
      ),
    );
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
