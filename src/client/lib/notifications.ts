/**
 * OS notifications when something long finishes while Blombo is in the background (Settings →
 * Notifications). The decisions are pure functions over two queue snapshots (tested); the live
 * store is watched once per window by `startNotifications()`, and `notify()` in lib/platform
 * only shows anything when the window is hidden or not focused.
 */
import type { Download } from "@shared/downloads";
import type { Job } from "@shared/jobs";
import type { NotificationSettings, Settings } from "@shared/settings";
import { useLive } from "./live";
import { notify } from "./platform";
import { qk, queryClient } from "./queries";
import { useSession } from "./session";

export interface Note {
  title: string;
  body: string;
}

const live = (s: string | undefined) => s === "queued" || s === "running";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What to announce when the queue goes from `prev` to `next`. */
export function queueNotes(prev: Job[], next: Job[], s: NotificationSettings): Note[] {
  if (!s.enabled) return [];
  const before = new Map(prev.map((j) => [j.id, j.state]));
  const notes: Note[] = [];
  const finished = next.filter((j) => !live(j.state) && live(before.get(j.id)));
  if (!finished.length) return notes;
  // Groups (scripts, batches): one note when the last of a group is done.
  const groups = new Map<string, Job[]>();
  for (const j of finished)
    if (j.group) groups.set(j.group.id, [...(groups.get(j.group.id) ?? []), j]);
  for (const [id, jobs] of groups) {
    if (!s.batches) continue;
    if (next.some((j) => j.group?.id === id && live(j.state))) continue;
    const all = next.filter((j) => j.group?.id === id && j.group.kind !== "grid");
    const done = all.filter((j) => j.state === "done").length;
    const failed = all.filter((j) => j.state === "error").length;
    const title = (jobs[0] as Job).group?.title ?? "Batch";
    notes.push({
      title: `${title} finished`,
      body: `${plural(done, "run")} done${failed ? `, ${failed} failed` : ""}.`,
    });
  }
  if (s.jobs) {
    const singles = finished.filter((j) => !j.group);
    const long = singles.filter((j) => {
      if (!j.startedAt || !j.finishedAt) return false;
      return Date.parse(j.finishedAt) - Date.parse(j.startedAt) >= s.minSeconds * 1000;
    });
    const queueEmpty = !next.some((j) => live(j.state));
    for (const j of long) {
      if (j.state === "done")
        notes.push({
          title: queueEmpty ? "Your image is ready" : "An image is ready",
          body: `${j.workflowName}${j.width && j.height ? ` · ${j.width}×${j.height}` : ""}`,
        });
      else if (j.state === "error")
        notes.push({
          title: `${j.workflowName} failed`,
          body: j.error ?? "Open Blombo to see why.",
        });
    }
  }
  // A burst of finishes becomes one note.
  if (notes.length > 3)
    return [{ title: "Blombo finished several runs", body: notes.map((n) => n.title).join(" · ") }];
  return notes;
}

/** Downloads that just finished or failed. */
export function downloadNotes(prev: Download[], next: Download[], s: NotificationSettings): Note[] {
  if (!s.enabled || !s.downloads) return [];
  const before = new Map(prev.map((d) => [d.id, d.state]));
  const notes: Note[] = [];
  for (const d of next) {
    const was = before.get(d.id);
    if (!was || was === d.state) continue;
    if (d.state === "done") notes.push({ title: "Download finished", body: d.name });
    if (d.state === "error") notes.push({ title: "Download failed", body: d.name });
  }
  return notes;
}

let started = false;

/** Watch the live store and announce what finished (once per window). */
export function startNotifications(): void {
  if (started) return;
  started = true;
  const settings = (): NotificationSettings | null => {
    const s = queryClient.getQueryData<Settings>(qk.settings(useSession.getState().profileId));
    return s?.notifications ?? null;
  };
  useLive.subscribe((state, prev) => {
    const s = settings();
    if (!s) return;
    const notes: Note[] = [];
    if (state.queue !== prev.queue) notes.push(...queueNotes(prev.queue.jobs, state.queue.jobs, s));
    if (state.downloads !== prev.downloads)
      notes.push(...downloadNotes(prev.downloads, state.downloads, s));
    for (const n of notes) void notify(n.title, n.body);
  });
}
