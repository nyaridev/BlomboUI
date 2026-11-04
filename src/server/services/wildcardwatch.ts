/**
 * Watches the open profile's wildcards folders, so a file changed anywhere (a rename's reference
 * update, another editor, Explorer) reaches the windows: `onChange` runs once per burst of changes
 * and context.ts announces `wildcards.changed` on the live bus. Only .txt / .yaml files and
 * folders count; the temp files of atomic writes and dotfiles don't.
 *
 * Windows keeps a watched folder open, so it can't be renamed or deleted itself while watched;
 * folders and files inside it can.
 */
import { type FSWatcher, watch } from "node:fs";
import path from "node:path";
import { wildcardFormat } from "../../shared/wildcards.ts";

const SETTLE_MS = 250;

/** Whether a change to `name` (relative, as fs.watch reports it) can change a wildcard. */
export function countsAsWildcardChange(name: string | null): boolean {
  if (!name) return true;
  const base = path.basename(name);
  if (base.startsWith(".")) return false;
  return wildcardFormat(base) !== null || path.extname(base) === "";
}

export class WildcardWatcher {
  private watchers: FSWatcher[] = [];
  private roots = "";
  private timer: NodeJS.Timeout | null = null;
  private readonly onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  /** Watch these folders instead of the ones before (nothing when the list is the same). */
  watch(folders: readonly string[]): void {
    const roots = folders.map((f) => f.trim()).filter(Boolean);
    const key = JSON.stringify(roots);
    if (key === this.roots) return;
    this.close();
    this.roots = key;
    for (const root of roots) {
      try {
        const w = watch(root, { recursive: true }, (_event, name) => {
          if (countsAsWildcardChange(name ? String(name) : null)) this.settle();
        });
        // A folder that disappears ends its watcher; the next watch() call starts over.
        w.on("error", () => w.close());
        this.watchers.push(w);
      } catch {
        // A folder that isn't there has nothing to watch; Settings → Folders says so.
      }
    }
  }

  private settle(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onChange();
    }, SETTLE_MS);
    this.timer.unref();
  }

  close(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    this.roots = "";
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
