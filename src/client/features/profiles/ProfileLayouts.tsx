/**
 * The profile screen's layouts, on trial (`useVariant` in ProfileScreen): Portrait cards, Continue
 * (the last profile large, the rest below), List and Split (a brand panel beside the grid). They
 * share the actions (open, open on launch, delete, new) and the small parts below; once one is
 * picked, the others go.
 */

import { Icon } from "@client/icons/Icon";
import { Logo, Wordmark } from "@client/icons/Logo";
import { avatarUrl } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { openWindow } from "@client/lib/platform";
import { Avatar, Button, Menu, type MenuEntry, openContextMenu } from "@client/ui";
import type { ComfyTarget, Profile } from "@shared/profile";
import type { ReactNode } from "react";

const REPO = "https://github.com/nyaridev/BlomboUI";

export interface LayoutProps {
  profiles: Profile[];
  launchId: string | null;
  /** The profile being opened (the others dim). */
  opening: string | null;
  version: string | null;
  onOpen: (p: Profile) => void;
  onSetLaunch: (p: Profile, on: boolean) => void;
  onDelete: (p: Profile) => void;
  onNew: () => void;
}

/* ── shared parts ─────────────────────────────────────────────────────────── */

export function timeAgo(iso: string | null): string {
  if (!iso) return "never opened";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "opened just now";
  if (s < 3600) return `opened ${Math.round(s / 60)}m ago`;
  if (s < 86400) return `opened ${Math.round(s / 3600)}h ago`;
  return `opened ${Math.round(s / 86400)}d ago`;
}

const images = (p: Profile) =>
  `${p.stats.images.toLocaleString()} image${p.stats.images === 1 ? "" : "s"}`;

function comfyLabel(c: ComfyTarget): string {
  if (c.mode === "managed") return "Managed ComfyUI";
  if (c.mode === "local") return "Your ComfyUI folder";
  try {
    return `ComfyUI at ${new URL(c.url).host}`;
  } catch {
    return "Your ComfyUI";
  }
}

function menuItems(p: Profile, props: LayoutProps): MenuEntry[] {
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

/** The ⋯ menu; `onImage` for a button over a picture. */
function Options({ p, props, onImage }: { p: Profile; props: LayoutProps; onImage?: boolean }) {
  return (
    <Menu
      placement="bottom-end"
      width={220}
      trigger={
        <button
          type="button"
          aria-label={`Options for ${p.name}`}
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-md focus-ring",
            onImage
              ? "bg-black/40 text-white hover:bg-black/60"
              : "text-fg-3 hover:bg-field hover:text-fg",
          )}
        >
          <Icon name="more-horizontal" size={16} />
        </button>
      }
      items={menuItems(p, props)}
    />
  );
}

/** Where a profile sits: its accent applies inside, it dims while another one opens. */
function Item({
  p,
  props,
  className,
  children,
}: {
  p: Profile;
  props: LayoutProps;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-accent={p.accent}
      onContextMenu={(e) => openContextMenu(e, menuItems(p, props))}
      className={cn(
        "group relative transition-opacity duration-150",
        props.opening !== null && props.opening !== p.id && "opacity-30",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Picture({ p, size, className }: { p: Profile; size: number; className?: string }) {
  return (
    <Avatar
      shape="card"
      name={p.name}
      src={avatarUrl(p)}
      accent={p.accent}
      size={size}
      className={cn(
        "transition-transform duration-200 ease-out group-hover:scale-[1.04]",
        className,
      )}
    />
  );
}

function AutoOpens({ onImage }: { onImage?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-2xs font-medium",
        onImage ? "bg-black/55 text-white" : "bg-accent/15 text-accent-ink",
      )}
    >
      <Icon name="bolt" size={11} />
      Auto-opens
    </span>
  );
}

function VersionLink({ version }: { version: string | null }) {
  if (!version) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      iconRight="github"
      className="font-mono"
      aria-label={`BlomboUI v${version} on GitHub`}
      onClick={() => openWindow(REPO, "BlomboUI on GitHub")}
    >
      v{version}
    </Button>
  );
}

const cardButton = (opening: boolean) =>
  cn(
    "relative overflow-hidden text-left transition-colors focus-ring",
    opening ? "border-accent" : "border-line group-hover:border-accent/80",
  );

/* ── A · Portrait cards ───────────────────────────────────────────────────── */

export function CardsLayout(props: LayoutProps) {
  const { profiles } = props;
  return (
    <div className="flex h-full flex-col overflow-auto bg-bg">
      <header className="flex shrink-0 items-center justify-between px-6 pt-5">
        <Wordmark />
        <VersionLink version={props.version} />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-balance text-fg">
            {profiles.length ? "Pick a profile" : "Make your first profile"}
          </h1>
          <p className="max-w-md text-sm text-balance text-fg-3">
            Each profile has its own workflows, folders, gallery and look.
          </p>
        </div>
        <ul className="flex max-w-6xl flex-wrap justify-center gap-5">
          {profiles.map((p) => (
            <li key={p.id}>
              <Item p={p} props={props} className="w-[208px]">
                <button
                  type="button"
                  onClick={() => props.onOpen(p)}
                  className={cn(
                    cardButton(props.opening === p.id),
                    "block w-full rounded-xl border bg-surface",
                  )}
                >
                  <span className="relative block aspect-[2/3] overflow-hidden">
                    <Picture p={p} size={208} />
                    {props.launchId === p.id ? (
                      <span className="absolute top-2.5 left-2.5">
                        <AutoOpens onImage />
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-col gap-0.5 border-t border-line px-3.5 py-3">
                    <span className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full bg-accent" />
                      <span className="truncate text-sm font-semibold text-fg">{p.name}</span>
                    </span>
                    <span className="truncate text-xs text-fg-3 tabular">
                      {images(p)} · {timeAgo(p.lastOpenedAt)}
                    </span>
                  </span>
                </button>
                <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                  <Options p={p} props={props} onImage />
                </div>
              </Item>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={props.onNew}
              className="flex h-full min-h-[312px] w-[208px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong text-fg-3 transition-colors hover:border-accent/60 hover:text-fg focus-ring"
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

/* ── B · Continue ─────────────────────────────────────────────────────────── */

export function ContinueLayout(props: LayoutProps) {
  const { profiles } = props;
  // The one opened last leads; never-opened ones keep their order after it.
  const last = [...profiles].sort((a, b) =>
    (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""),
  )[0];
  const rest = profiles.filter((p) => p !== last);
  return (
    <div className="flex h-full flex-col overflow-auto bg-bg">
      <header className="flex shrink-0 items-center justify-between px-6 pt-5">
        <Wordmark />
        <VersionLink version={props.version} />
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-8 py-10">
        {last ? (
          <Item p={last} props={props}>
            <span className="mb-3 block label-caps">Continue where you left off</span>
            <div className="flex gap-7 rounded-xl border border-line bg-surface p-5 max-sm:flex-col">
              <button
                type="button"
                onClick={() => props.onOpen(last)}
                aria-label={`Open ${last.name}`}
                className={cn(
                  cardButton(props.opening === last.id),
                  "block aspect-[2/3] w-[220px] shrink-0 rounded-lg border max-sm:w-full",
                )}
              >
                <Picture p={last} size={220} />
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-5 py-1">
                <div className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h1 className="truncate text-3xl font-semibold tracking-tight text-fg">
                      {last.name}
                    </h1>
                    <span className="text-sm text-fg-3">{timeAgo(last.lastOpenedAt)}</span>
                  </div>
                  <Options p={last} props={props} />
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                  <dt className="text-fg-3">Gallery</dt>
                  <dd className="text-fg tabular">{images(last)}</dd>
                  <dt className="text-fg-3">ComfyUI</dt>
                  <dd className="truncate text-fg">{comfyLabel(last.comfy)}</dd>
                  <dt className="text-fg-3">Models</dt>
                  <dd className="truncate font-mono text-xs leading-5 text-fg-2">
                    {last.folders.models[0]?.path ?? "Not set"}
                  </dd>
                </dl>
                <div className="mt-auto flex flex-wrap items-center gap-3">
                  <Button
                    variant="primary"
                    size="lg"
                    iconRight="arrow-right"
                    loading={props.opening === last.id}
                    onClick={() => props.onOpen(last)}
                  >
                    Open {last.name}
                  </Button>
                  {props.launchId === last.id ? <AutoOpens /> : null}
                </div>
              </div>
            </div>
          </Item>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-fg">Welcome to BlomboUI</h1>
            <p className="max-w-md text-sm text-fg-3">
              A profile keeps its own workflows, folders, gallery and look. Make one to start.
            </p>
            <Button variant="primary" size="lg" icon="plus" onClick={props.onNew}>
              New profile
            </Button>
          </div>
        )}
        {last ? (
          <section className="flex flex-col gap-3">
            <span className="label-caps">{rest.length ? "Other profiles" : "More profiles"}</span>
            <ul className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
              {rest.map((p) => (
                <li key={p.id}>
                  <Item p={p} props={props}>
                    <button
                      type="button"
                      onClick={() => props.onOpen(p)}
                      className={cn(
                        cardButton(props.opening === p.id),
                        "flex w-full items-center gap-3 rounded-lg border bg-surface p-2 pr-10",
                      )}
                    >
                      <span className="relative block h-[72px] w-12 shrink-0 overflow-hidden rounded-md">
                        <Picture p={p} size={48} />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 shrink-0 rounded-full bg-accent" />
                          <span className="truncate text-sm font-semibold text-fg">{p.name}</span>
                        </span>
                        <span className="truncate text-xs text-fg-3 tabular">{images(p)}</span>
                        <span className="truncate text-xs text-fg-3">
                          {timeAgo(p.lastOpenedAt)}
                        </span>
                      </span>
                    </button>
                    <div className="absolute top-1/2 right-2 -translate-y-1/2">
                      <Options p={p} props={props} />
                    </div>
                  </Item>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={props.onNew}
                  className="flex h-full min-h-[90px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm font-medium text-fg-3 transition-colors hover:border-accent/60 hover:text-fg focus-ring"
                >
                  <Icon name="plus" size={18} />
                  New profile
                </button>
              </li>
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}

/* ── C · List ─────────────────────────────────────────────────────────────── */

export function ListLayout(props: LayoutProps) {
  const { profiles } = props;
  return (
    <div className="flex h-full flex-col overflow-auto bg-bg">
      <main className="mx-auto flex w-full max-w-[600px] flex-1 flex-col justify-center gap-6 px-6 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo size={44} />
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-fg">
              Blombo<span className="text-fg-3">UI</span>
            </h1>
            <p className="text-sm text-fg-3">
              {profiles.length ? "Choose a profile to open" : "Make a profile to start"}
            </p>
          </div>
        </div>
        <ul className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
          {profiles.map((p) => (
            <li key={p.id} className="border-b border-line">
              <Item p={p} props={props}>
                <button
                  type="button"
                  onClick={() => props.onOpen(p)}
                  className={cn(
                    "flex w-full items-center gap-4 py-3 pr-14 pl-3 text-left transition-colors focus-ring",
                    props.opening === p.id ? "bg-accent/10" : "hover:bg-field",
                  )}
                >
                  <span className="relative block h-[66px] w-11 shrink-0 overflow-hidden rounded-md border border-line">
                    <Picture p={p} size={44} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full bg-accent" />
                      <span className="truncate text-sm font-semibold text-fg">{p.name}</span>
                      {props.launchId === p.id ? <AutoOpens /> : null}
                    </span>
                    <span className="truncate text-xs text-fg-3 tabular">
                      {images(p)} · {timeAgo(p.lastOpenedAt)}
                    </span>
                    <span className="truncate text-xs text-fg-4">{comfyLabel(p.comfy)}</span>
                  </span>
                  <Icon
                    name="chevron-right"
                    size={16}
                    className="shrink-0 text-fg-4 transition-colors group-hover:text-accent-ink"
                  />
                </button>
                <div className="absolute top-1/2 right-9 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                  <Options p={p} props={props} />
                </div>
              </Item>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={props.onNew}
              className="flex w-full items-center gap-4 py-3 pl-3 text-left text-sm font-medium text-fg-2 transition-colors hover:bg-field hover:text-fg focus-ring"
            >
              <span className="grid h-11 w-11 place-items-center rounded-md border border-dashed border-line-strong text-fg-3">
                <Icon name="plus" size={18} />
              </span>
              New profile
            </button>
          </li>
        </ul>
      </main>
      <footer className="flex shrink-0 justify-center pb-4">
        <VersionLink version={props.version} />
      </footer>
    </div>
  );
}

/* ── D · Split ────────────────────────────────────────────────────────────── */

export function SplitLayout(props: LayoutProps) {
  const { profiles } = props;
  return (
    <div className="grid h-full grid-cols-[380px_minmax(0,1fr)] bg-bg max-lg:grid-cols-1 max-lg:grid-rows-[auto_minmax(0,1fr)]">
      <aside className="flex flex-col justify-between gap-8 border-r border-line bg-surface p-10 max-lg:border-r-0 max-lg:border-b max-lg:p-6">
        <Wordmark />
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-fg">
            {profiles.length ? "Welcome back" : "Welcome"}
          </h1>
          <p className="text-sm leading-relaxed text-fg-2">
            A local studio for ComfyUI. Each profile keeps its own workflows, folders, gallery and
            look; pick one to start, or make one for another set of models.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="primary" icon="plus" onClick={props.onNew}>
              New profile
            </Button>
            <Button
              variant="ghost"
              icon="github"
              onClick={() => openWindow(REPO, "BlomboUI on GitHub")}
            >
              GitHub
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1 text-xs text-fg-3 max-lg:hidden">
          {props.version ? <span className="font-mono">v{props.version}</span> : null}
          <span>Runs on this PC. Nothing leaves it unless you download from Civitai.</span>
        </div>
      </aside>
      <main className="scroll-quiet overflow-y-auto p-10 max-lg:p-6">
        <div className="mb-4 flex items-baseline gap-2">
          <span className="label-caps">Profiles</span>
          <span className="font-mono text-2xs text-fg-3 tabular">{profiles.length}</span>
        </div>
        {profiles.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {profiles.map((p) => (
              <li key={p.id}>
                <Item p={p} props={props}>
                  <button
                    type="button"
                    onClick={() => props.onOpen(p)}
                    className={cn(
                      cardButton(props.opening === p.id),
                      "block aspect-[2/3] w-full rounded-xl border bg-surface",
                    )}
                  >
                    <Picture p={p} size={180} />
                    <span className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/85 via-black/45 to-transparent" />
                    <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3.5">
                      <span className="truncate text-base font-semibold text-white">{p.name}</span>
                      <span className="truncate text-xs text-white/70 tabular">
                        {images(p)} · {timeAgo(p.lastOpenedAt)}
                      </span>
                    </span>
                    {props.launchId === p.id ? (
                      <span className="absolute top-2.5 left-2.5">
                        <AutoOpens onImage />
                      </span>
                    ) : null}
                  </button>
                  <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                    <Options p={p} props={props} onImage />
                  </div>
                </Item>
              </li>
            ))}
          </ul>
        ) : (
          <button
            type="button"
            onClick={props.onNew}
            className="flex aspect-[2/3] w-[180px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong text-fg-3 transition-colors hover:border-accent/60 hover:text-fg focus-ring"
          >
            <Icon name="plus" size={28} strokeWidth={1.5} />
            <span className="text-sm font-medium">New profile</span>
          </button>
        )}
      </main>
    </div>
  );
}
