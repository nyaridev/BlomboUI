/** Avatar button + menu: profile card, the secondary views, and switching profiles. */
import { avatarUrl } from "@client/lib/api";
import { useLive } from "@client/lib/live";
import { glide } from "@client/lib/motion";
import { Avatar, Badge, Menu } from "@client/ui";
import type { ViewId } from "@shared/constants";
import type { Profile } from "@shared/profile";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";

export function AvatarMenu({
  profile,
  profileId,
  onNavigate,
}: {
  profile: Profile | undefined;
  profileId: string;
  onNavigate: (view: ViewId) => void;
}) {
  const navigate = useNavigate();
  const errors = useLive((s) => s.errors.length);
  const name = profile?.name ?? "Profile";
  const src = profile ? avatarUrl(profile, profile.lastOpenedAt ?? profile.createdAt) : null;

  return (
    <Menu
      width={264}
      header={
        <div className="mb-1 flex items-center gap-3 rounded-md bg-field/60 px-2.5 py-2.5">
          <Avatar name={name} src={src} accent={profile?.accent} size={38} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-fg">{name}</span>
            <span className="truncate font-mono text-2xs text-fg-3">
              {profile?.paths.outputs || "No output folder yet"}
            </span>
          </div>
        </div>
      }
      items={[
        {
          id: "settings",
          label: "Settings",
          icon: "settings",
          shortcut: "Ctrl ,",
          onSelect: () => onNavigate("settings"),
        },
        { id: "history", label: "History", icon: "history", onSelect: () => onNavigate("history") },
        {
          id: "errors",
          label: "Errors",
          icon: "errors",
          hint: errors ? <Badge tone="danger">{errors}</Badge> : undefined,
          onSelect: () => onNavigate("errors"),
        },
        { id: "scopes", label: "Scopes", icon: "scopes", onSelect: () => onNavigate("scopes") },
        { type: "separator", id: "s1" },
        {
          id: "help",
          label: "Help & prompt guide",
          icon: "book",
          shortcut: "F1",
          onSelect: () => onNavigate("help"),
        },
        {
          id: "keys",
          label: "Keyboard shortcuts",
          icon: "keyboard",
          shortcut: "?",
          onSelect: () => onNavigate("help"),
        },
        { id: "lab", label: "Design Lab", icon: "lab", onSelect: () => onNavigate("lab") },
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
          <motion.span layoutId={`avatar-${profileId}`} transition={glide} className="block">
            <Avatar name={name} src={src} accent={profile?.accent} size={30} />
          </motion.span>
        </button>
      }
    />
  );
}
