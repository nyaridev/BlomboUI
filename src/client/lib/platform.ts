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

export type NotifyPermission = "granted" | "denied" | "default" | "unsupported";

/** Whether this window may show OS notifications. */
export function notifyPermission(): NotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Ask for permission (browsers only allow this from a click). */
export async function askNotifyPermission(): Promise<NotifyPermission> {
  if (notifyPermission() === "unsupported") return "unsupported";
  return Notification.requestPermission();
}

/**
 * An OS notification (the browser's, or WebView2's in the desktop window), only while the app is
 * in the background: hidden, minimized or not focused. Clicking it brings the window back.
 * `force` shows it even in the foreground (the settings page's test button).
 */
export async function notify(title: string, body: string, force = false): Promise<void> {
  if (!force && document.visibilityState === "visible" && document.hasFocus()) return;
  const permission = notifyPermission();
  if (permission === "unsupported" || permission === "denied") return;
  if (permission === "default" && (await askNotifyPermission()) !== "granted") return;
  try {
    const n = new Notification(title, { body, icon: "/favicon.svg", tag: `blombo-${title}` });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Some webviews only allow notifications from a service worker; nothing to show then.
  }
}
