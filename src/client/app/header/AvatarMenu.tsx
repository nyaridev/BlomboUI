/** Avatar button + menu: profile card, the secondary views, and switching profiles. */
import { avatarUrl } from "@client/lib/api";
import { useLive } from "@client/lib/live";
import { Avatar, Badge, Menu } from "@client/ui";
import type { ViewId } from "@shared/constants";
import type { Profile } from "@shared/profile";
import { useNavigate } from "@tanstack/react-router";
import { useSettingsNav } from "../../features/settings/nav";
import { useShortcutLabel } from "../useShortcuts";

export function AvatarMenu({
  profile,
  onNavigate,
}: {
  profile: Profile | undefined;
  onNavigate: (view: ViewId) => void;
}) {
  const navigate = useNavigate();
  const keys = useShortcutLabel();
  const errors = useLive((s) => s.errors.length);
  const name = profile?.name ?? "Profile";
  const src = profile ? avatarUrl(profile) : null;

  return (
    <Menu
      width={264}
      header={
        <div className="mb-1 flex items-center gap-3 rounded-md bg-field/60 px-2.5 py-2.5">
          <Avatar name={name} src={src} accent={profile?.accent} size={38} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-fg">{name}</span>
            <span className="truncate font-mono text-2xs text-fg-3">
              {profile?.folders.outputs[0]?.path || "No output folder yet"}
            </span>
          </div>
        </div>
      }
      items={[
        {
          id: "settings",
          label: "Settings",
          icon: "settings",
          shortcut: keys("view.settings"),
          onSelect: () => onNavigate("settings"),
        },
        {
          id: "history",
          label: "History",
          icon: "history",
          shortcut: keys("view.history"),
          onSelect: () => onNavigate("history"),
        },
        {
          id: "errors",
          label: "Errors",
          icon: "errors",
          hint: errors ? <Badge tone="danger">{errors}</Badge> : undefined,
          shortcut: errors ? undefined : keys("view.errors"),
          onSelect: () => onNavigate("errors"),
        },
        { type: "separator", id: "s1" },
        {
          id: "help",
          label: "Help & prompt guide",
          icon: "book",
          shortcut: keys("view.help"),
          onSelect: () => onNavigate("help"),
        },
        {
          id: "keys",
          label: "Keyboard shortcuts",
          icon: "keyboard",
          shortcut: keys("shortcuts"),
          onSelect: () => {
            useSettingsNav.getState().go("shortcuts");
            onNavigate("settings");
          },
        },
        ...(import.meta.env.DEV
          ? [
              {
                id: "lab",
                label: "Design Lab",
                icon: "lab" as const,
                onSelect: () => onNavigate("lab"),
              },
              {
                id: "data",
                label: "Saved data",
                icon: "data" as const,
                onSelect: () => onNavigate("data"),
              },
            ]
          : []),
        { type: "separator", id: "s2" },
        {
          id: "switch",
          label: "Switch profile",
          icon: "profiles",
          onSelect: () => navigate({ to: "/" }),
        },
      ]}
      trigger={
        <button
          type="button"
          aria-label={`${name}: profile menu`}
          className="rounded-full p-0.5 transition-transform hover:scale-105 focus-ring data-[open]:scale-105"
        >
          <span className="block">
            <Avatar name={name} src={src} accent={profile?.accent} size={30} />
          </span>
        </button>
      }
    />
  );
}
