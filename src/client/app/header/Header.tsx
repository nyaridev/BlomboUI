/**
 * Header: workflow button · search | main views | system status · errors · avatar.
 * Views that aren't daily tools (Settings, History, Errors, Help) live in the avatar menu.
 * Below 1024px the main views move to a bottom bar (MobileNav) and the desktop-only tools hide.
 * Which main views show, their order and their labels come from Settings → Interface.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useSettings } from "@client/lib/queries";
import { IconButton, type MenuEntry, Tabs } from "@client/ui";
import type { MainView, ViewId } from "@shared/constants";
import type { Profile } from "@shared/profile";
import { headerTabs, UiSettings } from "@shared/settings";
import { useNavigate } from "@tanstack/react-router";
import { usePalette } from "../commands";
import { useShortcutLabel } from "../useShortcuts";
import { AvatarMenu } from "./AvatarMenu";
import { SystemCluster } from "./SystemCluster";
import { WorkflowSwitcher } from "./WorkflowSwitcher";

const NAV: Record<
  MainView,
  { value: MainView; label: string; icon: "generate" | "gallery" | "models" | "file-info" }
> = {
  generate: { value: "generate", label: "Generate", icon: "generate" },
  gallery: { value: "gallery", label: "Gallery", icon: "gallery" },
  models: { value: "models", label: "Models", icon: "models" },
  "file-info": { value: "file-info", label: "File Info", icon: "file-info" },
};
const DEFAULT_UI = UiSettings.parse({});

/** The main views that show, in the profile's order, and how their labels show. */
function useNav() {
  const ui = useSettings().data?.ui ?? DEFAULT_UI;
  return { items: headerTabs(ui).shown.map((v) => NAV[v]), labels: ui.headerLabels };
}

export function Header({
  profile,
  profileId,
  view,
}: {
  profile: Profile | undefined;
  profileId: string;
  view: ViewId;
}) {
  const go = useGo(profileId);
  const nav = useNav();
  // Labels hide on narrow windows (Auto) or always (Icons only); screen readers keep them.
  const labelClass =
    nav.labels === "icons" ? "sr-only" : nav.labels === "auto" ? "max-[1380px]:sr-only" : "";
  // Compare belongs to Generate: its tab stays lit there, named after it, with both in its menu.
  const shownView = view === "compare" ? "generate" : view;
  const isMain = nav.items.some((n) => n.value === shownView);
  const generateMenu: MenuEntry[] = [
    { id: "generate", label: "Generate", icon: "generate", onSelect: () => go("generate") },
    { id: "compare", label: "Compare", icon: "compare", onSelect: () => go("compare") },
  ];
  const keys = useShortcutLabel();
  const openPalette = usePalette((s) => s.set);

  return (
    // Three columns: the main tabs stay centered while there's room, and the status cluster
    // (which grows with the queue and download chips) pushes them aside instead of covering them.
    <header className="relative z-20 grid h-14 grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-center gap-3 border-b border-line bg-surface px-3 max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <div data-tour="workflow" className="contents">
          <WorkflowSwitcher />
        </div>
        <IconButton
          icon="search"
          label="Search and commands"
          shortcut={keys("palette")}
          onClick={() => openPalette(true)}
          className="max-lg:hidden"
        />
      </div>

      <nav aria-label="Main" className="max-lg:hidden">
        <Tabs
          label="Main views"
          items={nav.items.map((n) =>
            n.value === "generate"
              ? {
                  ...n,
                  ...(view === "compare" ? { icon: "compare" as const } : {}),
                  label: (
                    <span className={labelClass}>{view === "compare" ? "Compare" : n.label}</span>
                  ),
                  menu: generateMenu,
                  menuLabel: "Generate or Compare",
                }
              : { ...n, label: <span className={labelClass}>{n.label}</span> },
          )}
          value={isMain ? (shownView as MainView) : ("" as MainView)}
          onChange={go}
          className={cn(!isMain && "[&_[role=tab]]:text-fg-3")}
        />
      </nav>

      <div className="flex items-center justify-end gap-2 max-lg:gap-1">
        <SystemCluster />
        <span className="mx-1 h-6 w-px bg-line max-lg:hidden" />
        <AvatarMenu profile={profile} onNavigate={go} />
      </div>
    </header>
  );
}

function useGo(profileId: string) {
  const navigate = useNavigate();
  return (v: ViewId) =>
    v === "generate"
      ? navigate({ to: "/p/$profileId", params: { profileId } })
      : navigate({ to: "/p/$profileId/$view", params: { profileId, view: v } });
}

/** Narrow screens only: the main views as a bottom tab bar, within thumb reach. */
export function MobileNav({ profileId, view }: { profileId: string; view: ViewId }) {
  const go = useGo(profileId);
  const { items } = useNav();
  return (
    <nav
      aria-label="Main"
      className="grid auto-cols-fr grid-flow-col border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map((n) => {
        const active = n.value === view || (n.value === "generate" && view === "compare");
        return (
          <button
            key={n.value}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => go(n.value)}
            className={cn(
              "flex h-14 flex-col items-center justify-center gap-1 text-2xs font-medium focus-ring",
              active ? "text-fg" : "text-fg-3",
            )}
          >
            <Icon name={n.icon} size={20} className={active ? "text-accent-ink" : undefined} />
            {n.label}
          </button>
        );
      })}
    </nav>
  );
}
