/**
 * Layout actions for the Generate screen (ADR-0005). Layouts live in the profile's layouts/
 * folder on the server; picking one links it to the active workflow (manifest.layout), and
 * "Reset to default" unlinks it so the workflow shows the profile's default again.
 */
import { api } from "@client/lib/api";
import { qk, queryClient } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { toast } from "@client/ui";
import type { LayoutDocument, LayoutList } from "@shared/layout/schema";
import type { WorkflowDetail } from "@shared/workflow/manifest";
import { useLayout } from "./state";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function keys() {
  const profileId = useSession.getState().profileId;
  const workflowId = useLayout.getState().workflowId;
  return { profileId, workflowId };
}

function cachedList(): LayoutList | undefined {
  return queryClient.getQueryData<LayoutList>(qk.layouts(useSession.getState().profileId));
}

/** Keep the cached workflow in step with its link, so a reload shows the same thing. */
function patchWorkflow(layout: string | null, doc: LayoutDocument, source: "linked" | "default") {
  const { profileId, workflowId } = keys();
  if (!workflowId) return;
  queryClient.setQueryData<WorkflowDetail>(qk.workflow(profileId, workflowId), (old) =>
    old ? { ...old, layout, layoutDoc: doc, layoutSource: source } : old,
  );
}

/** Show a layout and link it to the active workflow. */
export async function chooseLayout(id: string): Promise<void> {
  const { workflowId } = keys();
  const list = cachedList();
  const doc = [...(list?.builtins ?? []), ...(list?.custom ?? [])].find((l) => l.id === id);
  if (!workflowId || !doc) return;
  try {
    await api.updateWorkflow(workflowId, { layout: id });
    useLayout.getState().setSaved(doc, "linked");
    patchWorkflow(id, doc, "linked");
  } catch (e) {
    toast(message(e), "error");
  }
}

/** Unlink: the workflow shows the profile's default layout again. */
export async function resetLayout(): Promise<void> {
  const { workflowId } = keys();
  const list = cachedList();
  if (!workflowId || !list) return;
  const doc =
    [...list.builtins, ...list.custom].find((l) => l.id === list.defaultId) ?? list.builtins[0];
  if (!doc) return;
  try {
    await api.updateWorkflow(workflowId, { layout: null });
    useLayout.getState().setSaved(doc, "default");
    patchWorkflow(null, doc, "default");
    toast(`Back to the default layout ("${doc.name}")`, "success");
  } catch (e) {
    toast(message(e), "error");
  }
}

/** Save edits into the current layout (the profile's own layouts only). */
export async function saveLayout(): Promise<boolean> {
  const { doc } = useLayout.getState();
  if (!doc) return false;
  try {
    const saved = await api.saveLayout(doc.id, doc);
    useLayout.setState({ doc: saved, saved, source: useLayout.getState().source });
    patchWorkflow(
      useLayout.getState().source === "linked" ? saved.id : null,
      saved,
      useLayout.getState().source,
    );
    void queryClient.invalidateQueries({ queryKey: ["layouts"] });
    toast(`Layout "${saved.name}" saved`, "success");
    return true;
  } catch (e) {
    toast(message(e), "error");
    return false;
  }
}

/** Save what's on screen as a new layout and link it to the active workflow. */
export async function saveLayoutAs(name: string): Promise<void> {
  const { doc } = useLayout.getState();
  const { workflowId } = keys();
  if (!doc) return;
  try {
    const created = await api.createLayout({
      name,
      doc,
      ...(workflowId ? { linkTo: workflowId } : {}),
    });
    useLayout.setState({ doc: created, saved: created, source: "linked" });
    patchWorkflow(created.id, created, "linked");
    await queryClient.invalidateQueries({ queryKey: ["layouts"] });
    toast(`Layout "${created.name}" saved`, "success");
  } catch (e) {
    toast(message(e), "error");
  }
}

export async function renameLayout(id: string, name: string): Promise<void> {
  try {
    const renamed = await api.renameLayout(id, name);
    const s = useLayout.getState();
    if (s.saved?.id === id) {
      const doc = s.doc === s.saved ? renamed : { ...(s.doc as LayoutDocument), name };
      useLayout.setState({ doc, saved: renamed });
    }
    await queryClient.invalidateQueries({ queryKey: ["layouts"] });
  } catch (e) {
    toast(message(e), "error");
  }
}

/** Move a layout to the profile's trash; workflows that showed it fall back to the default. */
export async function deleteLayout(id: string, name: string): Promise<void> {
  try {
    await api.deleteLayout(id);
    await queryClient.invalidateQueries({ queryKey: ["layouts"] });
    if (useLayout.getState().saved?.id === id) await resetLayout();
    void queryClient.invalidateQueries({ queryKey: ["workflow"] });
    toast(`Moved layout "${name}" to the profile's trash`, "success");
  } catch (e) {
    toast(message(e), "error");
  }
}

/** Throw away unsaved edits. */
export function discardLayoutEdits(): void {
  const s = useLayout.getState();
  if (s.saved) useLayout.setState({ doc: s.saved, past: [], future: [], selected: null });
}

const OLD_PRESETS_KEY = "blombo.layoutPresets";

/**
 * Layout presets used to live in this browser's storage. Move any that are still there into
 * the profile once, so they're saved with it and show up in every window.
 */
let adopting: Promise<void> | null = null;

/** Once per window (StrictMode runs effects twice; both would read the same list). */
export function adoptBrowserLayouts(): Promise<void> {
  adopting ??= adoptNow();
  return adopting;
}

async function adoptNow(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(OLD_PRESETS_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const docs = JSON.parse(raw) as LayoutDocument[];
    for (const doc of Array.isArray(docs) ? docs : [])
      await api.createLayout({ name: doc.name || "Layout", doc });
    localStorage.removeItem(OLD_PRESETS_KEY);
    if (docs.length) {
      await queryClient.invalidateQueries({ queryKey: ["layouts"] });
      toast(
        `Moved ${docs.length} saved layout${docs.length === 1 ? "" : "s"} into this profile`,
        "info",
      );
    }
  } catch {
    // Unreadable or rejected: leave them where they are.
  }
}
