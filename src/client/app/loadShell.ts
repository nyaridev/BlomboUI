/**
 * The app Shell (Generate, Gallery, the prompt editor) is its own chunk so the profile screen
 * paints without it. The profile screen warms it up once the browser is idle, so opening a
 * profile doesn't wait for the download.
 */
export const loadShell = () => import("./Shell");

export function preloadShell(): () => void {
  const start = () => void loadShell().catch(() => undefined);
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(start, { timeout: 2000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(start, 300);
  return () => clearTimeout(id);
}
