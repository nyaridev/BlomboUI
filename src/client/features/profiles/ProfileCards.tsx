/**
 * The profile screen's page: the mark and the version on top, the profiles as portrait cards
 * filled with their picture (name, then images, favorites and runs from `useProfileStats`, and
 * when it was last opened, over a dark scrim), and a New profile card.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { Wordmark } from "@client/icons/Logo";
import { avatarUrl } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { openWindow } from "@client/lib/platform";
import { Avatar, Button, IconButton, Menu, type MenuEntry, openContextMenu } from "@client/ui";
import type { Profile, ProfileStats } from "@shared/profile";

const REPO = "https://github.com/nyaridev/BlomboUI";
const CARD_W = "w-[220px]";

export interface ProfileGridProps {
  profiles: Profile[];
  stats: Record<string, ProfileStats> | undefined;
  launchId: string | null;
  /** The profile being opened (the others dim). */
  opening: string | null;
  version: string | null;
  onOpen: (p: Profile) => void;
  onSetLaunch: (p: Profile, on: boolean) => void;
  onDelete: (p: Profile) => void;
  onNew: () => void;
}

function opened(p: Profile): string {
  if (!p.lastOpenedAt) return "never opened";
  const s = (Date.now() - new Date(p.lastOpenedAt).getTime()) / 1000;
  if (s < 60) return "opened just now";
  if (s < 3600) return `opened ${Math.round(s / 60)}m ago`;
  if (s < 86400) return `opened ${Math.round(s / 3600)}h ago`;
  return `opened ${Math.round(s / 86400)}d ago`;
}

function menuItems(p: Profile, props: ProfileGridProps): MenuEntry[] {
  const isLaunch = props.launchId === p.id;
  return [
    { id: "open", label: "Open", icon: "arrow-right", onSelect: () => props.onOpen(p) },
    {
      id: "launch",
      label: isLaunch ? "Don't auto-open" : "Open on launch",
      icon: "bolt",
      onSelect: () => props.onSetLaunch(p, !isLaunch),
    },
    { type: "separator", id: "s1" },
    {
      id: "delete",
      label: "Delete…",
      icon: "trash",
      tone: "danger",
      onSelect: () => props.onDelete(p),
    },
  ];
}

export function ProfileGrid(props: ProfileGridProps) {
  return (
    <div className="flex h-full flex-col overflow-auto bg-bg">
      <header className="flex shrink-0 items-center justify-between px-6 pt-5">
        <Wordmark muted />
        {props.version ? (
          <Button
            variant="ghost"
            size="sm"
            iconRight="github"
            className="font-mono"
            aria-label={`BlomboUI v${props.version} on GitHub`}
            onClick={() => openWindow(REPO, "BlomboUI on GitHub")}
          >
            v{props.version}
          </Button>
        ) : null}
      </header>
      <main className="flex flex-1 items-center justify-center p-8">
        <ul className="flex max-w-6xl flex-wrap justify-center gap-5">
          {props.profiles.map((p) => (
            <li key={p.id}>
              <ProfileCard p={p} props={props} />
            </li>
          ))}
          <li className="flex">
            <button
              type="button"
              onClick={props.onNew}
              className={cn(
                CARD_W,
                "flex aspect-[2/3] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong text-fg-3 transition-colors hover:border-accent/60 hover:text-fg focus-ring",
              )}
            >
              <Icon name="plus" size={28} strokeWidth={1.5} />
              <span className="text-sm font-medium">New profile</span>
            </button>
          </li>
        </ul>
      </main>
    </div>
  );
}

function ProfileCard({ p, props }: { p: Profile; props: ProfileGridProps }) {
  const s = props.stats?.[p.id];
  const opening = props.opening === p.id;
  return (
    <div
      data-accent={p.accent}
      onContextMenu={(e) => openContextMenu(e, menuItems(p, props))}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-surface transition-[border-color,opacity] duration-150",
        CARD_W,
        opening ? "border-accent" : "border-line hover:border-accent/80",
        props.opening !== null && !opening && "opacity-30",
      )}
    >
      <button
        type="button"
        onClick={() => props.onOpen(p)}
        aria-label={`Open ${p.name}`}
        className="relative block aspect-[2/3] w-full overflow-hidden text-left focus-ring"
      >
        <Avatar
          shape="card"
          name={p.name}
          src={avatarUrl(p)}
          accent={p.accent}
          size={220}
          className="transition-transform duration-200 ease-out group-hover:scale-[1.04]"
        />
        {/* The scrim keeps the text readable on any picture. */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/85 via-black/45 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3.5">
          <span className="truncate text-base font-semibold text-white">{p.name}</span>
          <span className="flex items-center gap-3 text-xs text-white/85 tabular">
            <Stat icon="image" label="Images" value={s?.images} />
            <Stat icon="heart" label="Favorites" value={s?.favorites} />
            <Stat icon="play" label="Runs" value={s?.runs} />
          </span>
          <span className="truncate text-2xs text-white/60">{opened(p)}</span>
        </span>
        {props.launchId === p.id ? (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-xs bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-white backdrop-blur-[2px]">
            <Icon name="bolt" size={11} />
            Auto-opens
          </span>
        ) : null}
      </button>
      {/* Shown on hover, on keyboard focus and while its menu is open; always on touch screens. */}
      <div className="absolute top-2 right-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 pointer-coarse:opacity-100">
        <Menu
          placement="bottom-end"
          width={220}
          trigger={
            <IconButton
              icon="more-horizontal"
              label={`Options for ${p.name}`}
              size="sm"
              variant="overlay"
              tooltip={false}
            />
          }
          items={menuItems(p, props)}
        />
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: IconName; label: string; value?: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <Icon name={icon} size={12} className="text-white/60" />
      {value === undefined ? "–" : value.toLocaleString()}
    </span>
  );
}
