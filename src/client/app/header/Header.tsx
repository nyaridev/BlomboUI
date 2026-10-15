/**
 * Header: brand · workflow switcher | main views | system status · errors · avatar.
 * Views that aren't daily tools (Settings, History, Errors, Scopes, Help) live in the avatar menu.
 */
import { Logo } from "@client/icons/Logo";
import { cn } from "@client/lib/cn";
import { Tabs } from "@client/ui";
import type { MainView, ViewId } from "@shared/constants";
import type { Profile } from "@shared/profile";
import { useNavigate } from "@tanstack/react-router";
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
  const navigate = useNavigate();
  const go = (v: ViewId) =>
    v === "generate"
      ? navigate({ to: "/p/$profileId", params: { profileId } })
      : navigate({ to: "/p/$profileId/$view", params: { profileId, view: v } });
  const isMain = NAV.some((n) => n.value === view);

  return (
    <header className="relative z-20 flex h-14 items-center gap-3 border-b border-line bg-surface px-3">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => go("generate")}
          aria-label="Generate"
          className="rounded-[9px] focus-ring"
        >
          <Logo size={28} />
        </button>
        <WorkflowSwitcher />
      </div>

      <nav
        className="absolute left-1/2 -translate-x-1/2 max-[1180px]:static max-[1180px]:translate-x-0"
        aria-label="Main"
      >
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

      <div className="ml-auto flex items-center gap-2">
        <SystemCluster />
        <span className="mx-1 h-6 w-px bg-line" />
        <AvatarMenu profile={profile} profileId={profileId} onNavigate={go} />
      </div>
    </header>
  );
}
