/**
 * Settings: centered, organized pages. Overview first: the profile, the settings people change
 * most, and usage stats. Appearance is live (theme + accent save to the profile).
 */
import { useTheme } from "@client/app/theme";
import { MOCK_STATS } from "@client/features/preview/mock";
import { Icon, type IconName } from "@client/icons/Icon";
import { avatarUrl } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { snappy } from "@client/lib/motion";
import { useProfile, useUpdateProfile } from "@client/lib/queries";
import {
  Avatar,
  Badge,
  Button,
  Field,
  Panel,
  Segmented,
  Switch,
  TextField,
  Tooltip,
} from "@client/ui";
import { ACCENTS, THEME_LABELS, THEMES } from "@shared/constants";
import { useParams } from "@tanstack/react-router";
import { motion } from "motion/react";
import { type ReactNode, useState } from "react";

type PageId =
  | "overview"
  | "appearance"
  | "generate"
  | "files"
  | "gallery"
  | "models"
  | "civitai"
  | "autocomplete"
  | "comfy"
  | "shortcuts"
  | "about";

const PAGES: Array<{ id: PageId; label: string; icon: IconName; group: string }> = [
  { id: "overview", label: "Overview", icon: "gauge", group: "" },
  { id: "appearance", label: "Appearance", icon: "palette", group: "Profile" },
  { id: "files", label: "Folders & saving", icon: "folder", group: "Profile" },
  { id: "generate", label: "Generate", icon: "generate", group: "Tools" },
  { id: "gallery", label: "Gallery", icon: "gallery", group: "Tools" },
  { id: "models", label: "Models", icon: "models", group: "Tools" },
  { id: "civitai", label: "Civitai", icon: "globe", group: "Tools" },
  { id: "autocomplete", label: "Autocomplete", icon: "text", group: "Tools" },
  { id: "comfy", label: "ComfyUI", icon: "workflow", group: "System" },
  { id: "shortcuts", label: "Shortcuts", icon: "keyboard", group: "System" },
  { id: "about", label: "About", icon: "info", group: "System" },
];

export function SettingsView() {
  const [page, setPage] = useState<PageId>("overview");
  const [query, setQuery] = useState("");
  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1120px] grid-cols-[220px_minmax(0,1fr)] gap-10 px-8 pt-8 pb-16">
        <nav className="sticky top-8 flex flex-col gap-0.5 self-start" aria-label="Settings pages">
          <TextField
            icon="search"
            size="sm"
            placeholder="Search settings"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            className="mb-3"
          />
          {PAGES.map((p, i) => (
            <div key={p.id}>
              {p.group && p.group !== PAGES[i - 1]?.group ? (
                <div className="label-caps px-2.5 pt-4 pb-1.5 text-[10px]">{p.group}</div>
              ) : null}
              <button
                type="button"
                onClick={() => setPage(p.id)}
                className={cn(
                  "relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors focus-ring",
                  page === p.id ? "text-fg" : "text-fg-3 hover:bg-field hover:text-fg-2",
                )}
              >
                {page === p.id ? (
                  <motion.span
                    layoutId="settings-nav"
                    transition={snappy}
                    className="absolute inset-0 z-0 rounded-md bg-field ring-1 ring-line-strong"
                  />
                ) : null}
                <Icon
                  name={p.icon}
                  size={15}
                  className={cn("relative z-10", page === p.id && "text-accent-ink")}
                />
                <span className="relative z-10">{p.label}</span>
              </button>
            </div>
          ))}
        </nav>
        <motion.div
          key={page}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="min-w-0"
        >
          {page === "overview" ? (
            <Overview onGo={setPage} />
          ) : page === "appearance" ? (
            <Appearance />
          ) : (
            <PlannedPage id={page} />
          )}
        </motion.div>
      </div>
    </div>
  );
}

function PageHeader({ title, text }: { title: string; text?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
      {text ? <p className="text-sm text-fg-3">{text}</p> : null}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  icon: IconName;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <span className="flex items-center gap-1.5 text-xs text-fg-3">
        <Icon name={icon} size={13} />
        {label}
      </span>
      <span className="text-2xl font-semibold tracking-tight text-fg tabular">{value}</span>
      {sub ? <span className="text-xs text-fg-3">{sub}</span> : null}
    </div>
  );
}

/** Single-series horizontal ranking: one hue, rounded data ends, values in text ink. */
function RankList({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: IconName;
  rows: Array<{ name: string; count: number }>;
}) {
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
        <Icon name={icon} size={15} className="text-fg-3" />
        {title}
      </span>
      <ol className="flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <li key={r.name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-3 font-mono text-2xs text-fg-4">{i + 1}</span>
                <span className="truncate text-fg-2">{r.name}</span>
              </span>
              <span className="font-mono text-xs text-fg-3 tabular">
                {r.count.toLocaleString()}
              </span>
            </div>
            <Tooltip content={`${r.name}: ${r.count.toLocaleString()} images`}>
              <div className="ml-5 h-1.5 rounded-full bg-sunken">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </Tooltip>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function WeekBars({ values }: { values: number[] }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const max = Math.max(...values);
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
          <Icon name="chart" size={15} className="text-fg-3" />
          Images per day
        </span>
        <span className="text-xs text-fg-3">last 7 days</span>
      </div>
      <div className="flex h-28 items-end gap-2 border-b border-line">
        {values.map((v, i) => (
          <Tooltip key={days[i]} content={`${days[i]}: ${v} images`}>
            <div className="group flex h-full flex-1 items-end">
              <div
                className={cn(
                  "w-full rounded-t-[4px] transition-colors",
                  i === values.length - 1 ? "bg-accent" : "bg-accent/45 group-hover:bg-accent/70",
                )}
                style={{ height: `${(v / max) * 100}%` }}
              />
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="flex gap-2">
        {days.map((d) => (
          <span key={d} className="flex-1 text-center text-2xs text-fg-4">
            {d}
          </span>
        ))}
      </div>
    </Panel>
  );
}

function useCurrentProfile() {
  const { profileId } = useParams({ strict: false }) as { profileId?: string };
  return useProfile(profileId);
}

function Overview({ onGo }: { onGo: (p: PageId) => void }) {
  const profile = useCurrentProfile();
  const s = MOCK_STATS;
  return (
    <>
      <PageHeader
        title="Overview"
        text="Your profile at a glance. Usage numbers below are preview data until the gallery indexer lands."
      />
      <Panel className="mb-6 flex items-center gap-5 p-5">
        <Avatar
          name={profile?.name ?? "Profile"}
          src={profile ? avatarUrl(profile, profile.lastOpenedAt ?? "") : null}
          accent={profile?.accent}
          size={64}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-fg">{profile?.name ?? "…"}</span>
            <Badge tone="accent">{profile ? THEME_LABELS[profile.theme] : ""}</Badge>
          </div>
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
            {(["models", "outputs", "wildcards"] as const).map((k) => (
              <div key={k} className="contents">
                <span className="text-fg-3 capitalize">{k}</span>
                <span className="truncate font-mono text-fg-2">
                  {profile?.paths[k] || "not set"}
                </span>
              </div>
            ))}
          </div>
        </div>
        <Button icon="edit" onClick={() => onGo("files")}>
          Edit folders
        </Button>
      </Panel>

      <div className="mb-6 grid grid-cols-4 gap-3">
        <StatTile
          icon="image"
          label="Images generated"
          value={s.images.toLocaleString()}
          sub={`${s.thisWeek} this week`}
        />
        <StatTile
          icon="clock"
          label="Time generating"
          value={`${s.hours.toFixed(0)} h`}
          sub="GPU busy time"
        />
        <StatTile
          icon="heart"
          label="Favorites"
          value={s.favorites.toLocaleString()}
          sub={`${((s.favorites / s.images) * 100).toFixed(1)}% of images`}
        />
        <StatTile icon="crown" label="Favorite model" value="WAI v14" sub="43% of images" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <WeekBars values={s.perDay} />
        <RankList title="Most used models" icon="models" rows={s.topModels} />
        <RankList title="Most used LoRAs" icon="layers" rows={s.topLoras} />
        <RankList title="Most used wildcards" icon="wildcards" rows={s.topWildcards} />
      </div>

      <h2 className="label-caps mb-3">Quick settings</h2>
      <Panel className="flex flex-col divide-y divide-line">
        <QuickRow
          icon="palette"
          title="Appearance"
          text="Theme and profile color"
          onClick={() => onGo("appearance")}
        />
        <QuickRow
          icon="folder"
          title="Output folder and file names"
          text={profile?.paths.outputs || "Not set"}
          onClick={() => onGo("files")}
        />
        <QuickRow
          icon="workflow"
          title="ComfyUI"
          text="Managed · slot latest · bridge installed"
          onClick={() => onGo("comfy")}
        />
        <QuickRow
          icon="globe"
          title="Civitai account"
          text="No API key yet. Downloads of some models need one."
          onClick={() => onGo("civitai")}
          warn
        />
      </Panel>
    </>
  );
}

function QuickRow({
  icon,
  title,
  text,
  onClick,
  warn,
}: {
  icon: IconName;
  title: string;
  text: string;
  onClick: () => void;
  warn?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3.5 px-4 py-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-field focus-ring"
    >
      <span className="grid h-8 w-8 place-items-center rounded-md bg-field text-fg-2">
        <Icon name={icon} size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-fg">{title}</span>
        <span className={cn("truncate text-xs", warn ? "text-warning" : "text-fg-3")}>{text}</span>
      </span>
      <Icon name="chevron-right" size={15} className="text-fg-3" />
    </button>
  );
}

function Appearance() {
  const profile = useCurrentProfile();
  const update = useUpdateProfile();
  const preview = useTheme((s) => s.set);
  const theme = useTheme((s) => s.theme);
  const accent = useTheme((s) => s.accent);
  const [motionPref, setMotionPref] = useState("full");
  const [density, setDensity] = useState("comfortable");
  const [blur, setBlur] = useState(true);
  const save = (patch: { theme?: (typeof THEMES)[number]; accent?: (typeof ACCENTS)[number] }) => {
    preview(patch);
    if (profile) update.mutate({ id: profile.id, body: patch });
  };
  return (
    <>
      <PageHeader title="Appearance" text="Saved to this profile. Changes apply right away." />
      <div className="flex flex-col gap-8">
        <Field label="Theme" layout="left">
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t}
                type="button"
                data-theme={t}
                data-accent={accent}
                onClick={() => save({ theme: t })}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border bg-bg p-2 text-left focus-ring",
                  t === theme
                    ? "border-accent shadow-[0_0_0_1px_var(--accent)]"
                    : "border-line hover:border-line-strong",
                )}
              >
                <div className="flex h-14 gap-1.5 rounded-md border border-line bg-surface p-1.5">
                  <div className="w-7 rounded-sm bg-surface-2" />
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="h-2 w-3/4 rounded-full bg-field" />
                    <div className="h-2 w-1/2 rounded-full bg-field" />
                    <div className="mt-auto flex gap-1">
                      <div className="h-3 w-8 rounded-sm bg-accent" />
                      <div className="h-3 w-5 rounded-sm bg-generate" />
                    </div>
                  </div>
                </div>
                <span className="px-0.5 text-xs font-medium text-fg">{THEME_LABELS[t]}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field
          label="Profile color"
          layout="left"
          hint="Used for the avatar ring, selection, sliders and focus."
        >
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                aria-label={a}
                aria-pressed={a === accent}
                onClick={() => save({ accent: a })}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full transition-transform focus-ring",
                  a === accent
                    ? "scale-110 ring-2 ring-fg ring-offset-2 ring-offset-bg"
                    : "hover:scale-105",
                )}
                style={{ background: `linear-gradient(135deg, var(--${a}-ink), var(--${a}))` }}
              >
                {a === accent ? (
                  <Icon name="check" size={14} strokeWidth={2.6} className="text-white" />
                ) : null}
              </button>
            ))}
          </div>
        </Field>
        <Field
          label="Motion"
          layout="left"
          hint="Reduced keeps fades but drops movement. System follows Windows settings."
        >
          <Segmented
            value={motionPref}
            onChange={setMotionPref}
            options={[
              { value: "full", label: "Full" },
              { value: "reduced", label: "Reduced" },
              { value: "system", label: "System" },
            ]}
          />
        </Field>
        <Field label="Density" layout="left">
          <Segmented
            value={density}
            onChange={setDensity}
            options={[
              { value: "compact", label: "Compact" },
              { value: "comfortable", label: "Comfortable" },
            ]}
          />
        </Field>
        <Field
          label="Blur NSFW thumbnails"
          layout="left"
          hint="Civitai results and model cards. Hover or click to reveal."
        >
          <Switch checked={blur} onCheckedChange={setBlur} label="Blur NSFW thumbnails" />
        </Field>
      </div>
    </>
  );
}

const PLANNED: Partial<Record<PageId, { title: string; phase: string; items: string[] }>> = {
  files: {
    title: "Folders & saving",
    phase: "Phase 1",
    items: [
      "Models, outputs, wildcards folders",
      "File name patterns for images, grids, hires",
      "PNG / WebP / JPEG, quality, large-file JPEG",
      "Temp folder cleanup",
      "Save interrupted images",
    ],
  },
  generate: {
    title: "Generate",
    phase: "Phase 1",
    items: [
      "Hidden samplers and schedulers",
      "Saved resolutions",
      "Live preview frequency",
      "Batch grids (format, rows, max)",
      "LoRA strength ranges and auto-apply",
      "Prompt weight step",
    ],
  },
  gallery: {
    title: "Gallery",
    phase: "Phase 2",
    items: [
      "Default layout and tile size",
      "Thumbnail size and format",
      "Page size",
      "Trash: auto-purge after hours / GB",
    ],
  },
  models: {
    title: "Models",
    phase: "Phase 2",
    items: [
      "Hidden model types",
      "Thumbnail scopes defaults",
      "Model info layout",
      "Manager download folder and parallel installs",
    ],
  },
  civitai: {
    title: "Civitai",
    phase: "Phase 3",
    items: [
      "API key",
      "Browse defaults (sort, period, base models, NSFW)",
      "Download sorting (base model / category / creator)",
      "Author aliases and naming",
      "Labels for downloaded models",
      "History limits",
    ],
  },
  autocomplete: {
    title: "Autocomplete",
    phase: "Phase 1",
    items: [
      "Tag lists (Danbooru, e621, custom CSV)",
      "Wildcard / LoRA / trigger-word completion",
      "Frequent tags",
      "Thumbnails in suggestions",
    ],
  },
  comfy: {
    title: "ComfyUI",
    phase: "Phase 1",
    items: [
      "Managed slot or external URL",
      "Launch arguments and port",
      "Install / update blombo-bridge",
      "Torch, SageAttention, FlashAttention per slot",
      "Live logs",
    ],
  },
  shortcuts: {
    title: "Shortcuts",
    phase: "Phase 5",
    items: ["Every shortcut, searchable", "Rebind keys", "Tab number keys follow layout"],
  },
  about: {
    title: "About",
    phase: "Phase 0",
    items: [
      "Version and changelog",
      "Open data folder",
      "Design Lab",
      "Export or import this profile",
    ],
  },
};

function PlannedPage({ id }: { id: PageId }) {
  const p = PLANNED[id];
  if (!p) return null;
  return (
    <>
      <PageHeader title={p.title} />
      <Panel className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Badge tone="accent">{p.phase}</Badge>
          <span className="text-sm text-fg-3">Planned settings on this page:</span>
        </div>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
          {p.items.map((it) => (
            <li key={it} className="flex items-start gap-2 text-sm text-fg-2">
              <Icon name="check" size={14} className="mt-0.5 text-fg-4" />
              {it}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
