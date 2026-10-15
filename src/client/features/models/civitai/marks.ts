/**
 * The mark on a Civitai card or page: "Downloading" while a file of it is in the queue,
 * "Installed" when its newest version is in the models folder, "Update" when only an older one
 * is. The server's answer (`local`) comes from the models folder when the page was loaded; this
 * session's finished downloads count too, so a mark appears as soon as a download lands.
 */
import type { CardMark } from "@client/ui";
import type { LocalMark } from "@shared/civitai";
import type { Download } from "@shared/downloads";

export function localVersions(
  modelId: number,
  local: LocalMark | null,
  downloads: Download[],
): Set<number> {
  const versions = new Set(local?.versions ?? []);
  for (const d of downloads)
    if (d.modelId === modelId && d.state === "done" && d.versionId) versions.add(d.versionId);
  return versions;
}

export function cardMark(
  card: { id: number; versionId: number | null; local: LocalMark | null },
  downloads: Download[],
  showInstalled: boolean,
): CardMark | null {
  if (
    downloads.some((d) => d.modelId === card.id && (d.state === "running" || d.state === "queued"))
  )
    return { label: "Downloading", icon: "download", tone: "accent" };
  if (!showInstalled) return null;
  const versions = localVersions(card.id, card.local, downloads);
  if (!versions.size) return null;
  if (card.versionId !== null && versions.has(card.versionId))
    return { label: "Installed", icon: "check", tone: "success" };
  return { label: "Update", icon: "arrow-up", tone: "warning" };
}
