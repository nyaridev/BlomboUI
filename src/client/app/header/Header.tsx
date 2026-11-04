/**
 * Header: workflow button · search bar | main views | system status · errors · avatar.
 * Views that aren't daily tools (Settings, History, Errors, Help) live in the avatar menu.
 * Below 1024px the main views move to a bottom bar (MobileNav) and the desktop-only tools hide.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { Kbd, Tabs } from "@client/ui";
import type { MainView, ViewId } from "@shared/constants";
import type { Profile } from "@shared/profile";
import { useNavigate } from "@tanstack/react-router";
import { usePalette } from "../commands";
import { useShortcutLabel } from "../useShortcuts";
import { AvatarMenu } from "./AvatarMenu";
import { SystemCluster } from "./SystemCluster";
import { WorkflowSwitcher } from "./WorkflowSwitcher";

const NAV: Array<{
  value: MainView;
  label: string;
  icon: "generate" | "gallery" | "models" | "wildcards" | "file-info";
}> = [
  { value: "generate", label: "Generate", icon: "generate" },
  { value: "gallery", label: "Gallery", icon: "gallery" },
  { value: "models", label: "Models", icon: "models" },
  { value: "wildcards", label: "Wildcards", icon: "wildcards" },
  { value: "file-info", label: "File Info", icon: "file-info" },
];

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
  const isMain = NAV.some((n) => n.value === view);
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
        {/* Looks like a field, opens the command palette (which does the searching). */}
        <button
          type="button"
          onClick={() => openPalette(true)}
          aria-label="Search and commands"
          className="flex h-9 w-60 min-w-0 shrink items-center gap-2 rounded-lg border border-line bg-field px-2.5 text-sm text-fg-3 transition-colors hover:border-line-strong hover:text-fg-2 focus-ring max-xl:w-9 max-xl:shrink-0 max-xl:justify-center max-xl:px-0 max-lg:hidden"
        >
          <Icon name="search" size={15} className="shrink-0" />
          <span className="flex-1 truncate text-left max-xl:hidden">Search</span>
          {keys("palette") ? <Kbd className="max-xl:hidden">{keys("palette")}</Kbd> : null}
        </button>
      </div>

      <nav aria-label="Main" className="max-lg:hidden">
        <Tabs
          label="Main views"
          items={NAV.map((n) => ({
            ...n,
            label: <span className="max-[1380px]:hidden">{n.label}</span>,
          }))}
          value={isMain ? (view as MainView) : ("" as MainView)}
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
  return (
    <nav
      aria-label="Main"
      className="grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {NAV.map((n) => {
        const active = n.value === view;
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
