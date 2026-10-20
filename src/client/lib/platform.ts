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

/**
 * A window for an address that isn't known yet (it needs a request first). Browsers only allow
 * a new window during the click, so the browser version opens an empty one right away and
 * points it at the address later; the desktop window opens it when the address arrives.
 */
export function prepareWindow(title: string): {
  go: (url: string) => Promise<void>;
  close: () => void;
} {
  if (isDesktop()) return { go: (url) => openWindow(url, title), close: () => undefined };
  const win = window.open("about:blank", "_blank");
  if (win)
    try {
      win.document.title = title;
      win.document.body.style.cssText = "font: 13px system-ui; padding: 24px; color: #888";
      win.document.body.textContent = `Opening ${title}…`;
    } catch {
      // A blank window we can't write to is fine.
    }
  return {
    go: async (url) => {
      if (win && !win.closed) {
        win.opener = null;
        win.location.replace(url);
      } else window.open(url, "_blank", "noopener");
    },
    close: () => win?.close(),
  };
}

/** Notify when the app is in the background (long jobs, finished downloads). */
export async function notify(title: string, body: string): Promise<void> {
  if (document.visibilityState === "visible") return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") await Notification.requestPermission();
  if (Notification.permission === "granted") new Notification(title, { body });
}
