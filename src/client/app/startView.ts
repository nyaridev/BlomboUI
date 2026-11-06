/**
 * Where a profile opens (Settings → Interface → Open on): Generate by default, another main
 * view, or the one it was left on (remembered per profile in this browser). Only a profile that
 * lands on Generate is moved, so a link or a reload on another view stays where it is.
 */
import { useGoToView } from "@client/lib/hooks";
import { useSettings } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { MAIN_VIEWS, type MainView, type ViewId } from "@shared/constants";
import { useEffect, useRef } from "react";

const key = (profileId: string) => `blombo.lastView.${profileId}`;
const isMain = (v: string | null): v is MainView =>
  (MAIN_VIEWS as readonly string[]).includes(v ?? "");
/** The last view as it was when the profile opened, before this visit writes over it. */
const lastAtOpen = new Map<string, string | null>();

export function useStartView(profileId: string, view: ViewId): void {
  if (!lastAtOpen.has(profileId)) lastAtOpen.set(profileId, localStorage.getItem(key(profileId)));
  const ui = useSettings().data?.ui;
  const open = useSession((s) => s.profileId) === profileId;
  const go = useGoToView();
  const decided = useRef<string | null>(null);

  useEffect(() => {
    if (isMain(view)) localStorage.setItem(key(profileId), view);
  }, [profileId, view]);

  useEffect(() => {
    if (!ui || !open || decided.current === profileId) return;
    decided.current = profileId;
    if (view !== "generate") return;
    const want = ui.startView === "last" ? (lastAtOpen.get(profileId) ?? null) : ui.startView;
    if (isMain(want) && want !== "generate") go(want);
  }, [ui, open, profileId, view, go]);
}
