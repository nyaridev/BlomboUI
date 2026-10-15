/**
 * Platform hooks with a web fallback (ADR-0002). In the Tauri window the page has IPC for
 * localhost origins; in a browser everything degrades to standard web APIs.
 */

export const isDesktop = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Open a URL in a separate window (ComfyUI editor, Civitai page). */
export async function openWindow(url: string, title: string): Promise<void> {
  if (isDesktop()) {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const label = `w${Date.now().toString(36)}`;
      new WebviewWindow(label, { url, title, width: 1400, height: 900, center: true });
      return;
    } catch {
      // fall through to the browser behavior
    }
  }
  window.open(url, "_blank", "noopener");
}

/** Notify when the app is in the background (long jobs, finished downloads). */
export async function notify(title: string, body: string): Promise<void> {
  if (document.visibilityState === "visible") return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") await Notification.requestPermission();
  if (Notification.permission === "granted") new Notification(title, { body });
}
