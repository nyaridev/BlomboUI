/**
 * Settings: centered, organized pages. Overview first: the profile, the settings people change
 * most, and usage stats from the gallery index. Appearance is live (theme and accent save to the
 * profile, the UI font and NSFW blur to its settings).
 */
import { useTheme } from "@client/app/theme";
import { Icon, type IconName } from "@client/icons/Icon";
import { avatarUrl } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useLive } from "@client/lib/live";
import { snappy } from "@client/lib/motion";
import {
  useGalleryFacets,
  useGalleryOverview,
  useProfile,
  useSettings,
  useUpdateProfile,
  useUpdateSettings,
} from "@client/lib/queries";
import {
  Avatar,
  Badge,
  Button,
  Field,
  Panel,
  Segmented,
  Slider,
  Switch,
  TextField,
  Tooltip,
} from "@client/ui";
import { ACCENTS, THEME_LABELS, THEMES } from "@shared/constants";
import { fontStack, UI_FONT_LABELS, UI_FONTS, type UiFont } from "@shared/settings";
import { useParams } from "@tanstack/react-router";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { CivitaiPage } from "./CivitaiPage";
import { ComfyPage } from "./ComfyPage";
import { FoldersPage } from "./FoldersPage";
import { type SettingsPage as PageId, useSettingsNav } from "./nav";

const PAGES: Array<{ id: PageId; label: string; icon: IconName; group: string }> = [
  { id: "overview", label: "Overview", icon: "gauge", group: "" },
  { id: "appearance", label: "Appearance", icon: "palette", group: "Profile" },
  { id: "files", label: "Folders", icon: "folder", group: "Profile" },
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
  const page = useSettingsNav((s) => s.page);
  const setPage = useSettingsNav((s) => s.go);
  const profile = useCurrentProfile();
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
          ) : page === "files" ? (
            <>
              <PageHeader
                title="Folders"
                text="Where this profile's models, images and wildcards live."
              />
              <FoldersPage profile={profile} />
            </>
          ) : page === "comfy" ? (
            <>
              <PageHeader
                title="ComfyUI"
                text="The engine that generates. Blombo can install and run it for you."
              />
              <ComfyPage profile={profile} />
            </>
          ) : page === "gallery" ? (
            <GalleryPage />
          ) : page === "models" ? (
            <ModelsPage />
          ) : page === "civitai" ? (
            <CivitaiPage
              header={
                <PageHeader
                  title="Civitai"
                  text="Your account, browsing, where downloads land, and what Blombo remembers."
                />
              }
            />
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
      <span
        className="truncate text-2xl font-semibold tracking-tight text-fg tabular"
        title={value}
      >
        {value}
      </span>
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
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
        <Icon name={icon} size={15} className="text-fg-3" />
        {title}
      </span>
      {rows.length === 0 ? <p className="text-xs text-fg-3">Nothing yet.</p> : null}
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
  const days = values.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (values.length - 1 - i));
    return i === values.length - 1
      ? "Today"
      : d.toLocaleDateString(undefined, { weekday: "short" });
  });
  const max = Math.max(1, ...values);
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
  const overview = useGalleryOverview().data;
  const facets = useGalleryFacets("all").data;
  const comfy = useLive((st) => st.comfy);
  const counts = overview?.counts;
  const total = counts?.all ?? 0;
  const top = facets?.models[0];
  const n = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString());
  return (
    <>
      <PageHeader
        title="Overview"
        text="Your profile at a glance. Numbers come from the gallery's index."
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
          label="Images"
          value={n(counts?.all)}
          sub={counts ? `${n(counts.week)} this week` : undefined}
        />
        <StatTile
          icon="heart"
          label="Favorites"
          value={n(counts?.favorites)}
          sub={
            counts && total
              ? `${((counts.favorites / total) * 100).toFixed(1)}% of images`
              : undefined
          }
        />
        <StatTile
          icon="crown"
          label="Favorite model"
          value={top ? top.name : "—"}
          sub={
            top && total
              ? `${Math.round((top.count / total) * 100)}% of images`
              : "Generate to find out"
          }
        />
        <StatTile
          icon="trash"
          label="In the trash"
          value={n(counts?.trash)}
          sub="Restore from the gallery"
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <WeekBars values={overview?.perDay ?? [0, 0, 0, 0, 0, 0, 0]} />
        <RankList title="Most used models" icon="models" rows={facets?.models.slice(0, 5) ?? []} />
        <RankList title="Most used LoRAs" icon="layers" rows={facets?.loras.slice(0, 5) ?? []} />
        <RankList
          title="Libraries"
          icon="gallery"
          rows={overview?.libraries.map((l) => ({ name: l.name, count: l.count })) ?? []}
        />
      </div>

      <h2 className="label-caps mb-3">Quick settings</h2>
      <Panel className="flex flex-col divide-y divide-line">
        <QuickRow
          icon="palette"
          title="Appearance"
          text="Theme, profile color and font"
          onClick={() => onGo("appearance")}
        />
        <QuickRow
          icon="folder"
          title="Folders"
          text={profile?.paths.outputs || "No outputs folder yet"}
          onClick={() => onGo("files")}
          warn={!profile?.paths.outputs}
        />
        <QuickRow
          icon="workflow"
          title="ComfyUI"
          text={
            profile?.comfy.mode === "external"
              ? `Your own at ${profile.comfy.url}`
              : `Managed · slot ${profile?.comfy.mode === "managed" ? profile.comfy.slot : "—"}${comfy?.state === "missing" ? " · not installed yet" : ""}`
          }
          onClick={() => onGo("comfy")}
          warn={comfy?.state === "missing"}
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
  const settings = useSettings().data;
  const updateSettings = useUpdateSettings();
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
        <FontPicker
          font={settings?.appearance.font ?? "geist"}
          custom={settings?.appearance.customFont ?? ""}
          onChange={(appearance) => updateSettings.mutate({ appearance })}
        />
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
          hint="Model cards (and Civitai results later) marked NSFW stay blurred until you click them."
        >
          <Switch
            checked={settings?.models.blurNsfw ?? true}
            onCheckedChange={(blurNsfw) => updateSettings.mutate({ models: { blurNsfw } })}
            label="Blur NSFW thumbnails"
          />
        </Field>
      </div>
    </>
  );
}

const PLANNED: Partial<Record<PageId, { title: string; phase: string; items: string[] }>> = {
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

/* ── font ───────────────────────────────────────────────────────────────── */

function FontPicker({
  font,
  custom,
  onChange,
}: {
  font: UiFont;
  custom: string;
  onChange: (patch: { font?: UiFont; customFont?: string }) => void;
}) {
  const [draft, setDraft] = useState(custom);
  useEffect(() => setDraft(custom), [custom]);
  // Type a family name and it previews as you type; it saves when you stop.
  useEffect(() => {
    if (font !== "custom" || draft === custom) return;
    const t = setTimeout(() => onChange({ customFont: draft }), 500);
    return () => clearTimeout(t);
  }, [draft, custom, font, onChange]);
  const sample = (f: UiFont) =>
    f === "custom"
      ? (fontStack("custom", draft) ?? "var(--font-ui)")
      : {
          geist: '"Geist Variable", sans-serif',
          inter: '"Inter Variable", sans-serif',
          segoe: '"Segoe UI Variable Text", "Segoe UI", sans-serif',
          system: "system-ui, sans-serif",
        }[f];
  return (
    <Field
      label="Font"
      layout="left"
      hint="Geist and Inter come with Blombo. The others use fonts on this computer. Numbers and code stay in Geist Mono."
    >
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="UI font">
          {UI_FONTS.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={font === f}
              onClick={() => onChange({ font: f })}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border bg-surface p-2.5 text-left transition-colors focus-ring",
                font === f
                  ? "border-accent shadow-[0_0_0_1px_var(--accent)]"
                  : "border-line hover:border-line-strong",
              )}
            >
              <span
                className="text-xl leading-none font-semibold text-fg"
                style={{ fontFamily: sample(f) }}
              >
                Aa
              </span>
              <span className="truncate text-2xs text-fg-2">{UI_FONT_LABELS[f]}</span>
            </button>
          ))}
        </div>
        {font === "custom" ? (
          <TextField
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Font name, e.g. Fira Sans"
            icon="font"
            className="w-72"
            aria-label="Installed font name"
          />
        ) : null}
      </div>
    </Field>
  );
}

/* ── gallery and models pages ───────────────────────────────────────────── */

function GalleryPage() {
  const settings = useSettings().data?.gallery;
  const update = useUpdateSettings();
  const [size, setSize] = useState<number | null>(null);
  const tile = size ?? settings?.tileSize ?? 220;
  useEffect(() => {
    if (size === null || size === settings?.tileSize) return;
    const t = setTimeout(() => update.mutate({ gallery: { tileSize: size } }), 400);
    return () => clearTimeout(t);
  }, [size, settings?.tileSize, update]);
  return (
    <>
      <PageHeader
        title="Gallery"
        text="How the gallery lays out your images. Saved to this profile."
      />
      <div className="flex flex-col gap-8">
        <Field
          label="Layout"
          layout="left"
          hint="Justified rows keep every image's shape; the grid crops to squares."
        >
          <Segmented
            value={settings?.layout ?? "justified"}
            onChange={(layout) => update.mutate({ gallery: { layout } })}
            options={[
              { value: "justified", label: "Justified rows", icon: "layout-rows" },
              { value: "grid", label: "Square grid", icon: "layout-grid" },
            ]}
          />
        </Field>
        <Field label="Tile size" layout="left" hint="Row height (justified) or tile width (grid).">
          <div className="w-72">
            <Slider
              value={tile}
              onChange={setSize}
              min={120}
              max={400}
              step={10}
              unit="px"
              label="Tile size"
            />
          </div>
        </Field>
        <Field
          label="Libraries"
          layout="left"
          hint="Add, rename or remove folders from the gallery's sidebar."
        >
          <span className="pt-1.5 text-sm text-fg-2">
            {settings?.libraries.length
              ? settings.libraries.map((l) => l.name).join(", ")
              : "Only the outputs folder so far."}
          </span>
        </Field>
      </div>
    </>
  );
}

function ModelsPage() {
  const settings = useSettings().data;
  const update = useUpdateSettings();
  return (
    <>
      <PageHeader title="Models" text="The Models view and model cards. Saved to this profile." />
      <div className="flex flex-col gap-8">
        <Field
          label="Blur NSFW thumbnails"
          layout="left"
          hint="Thumbnails whose info file marks them NSFW stay blurred until you click them."
        >
          <Switch
            checked={settings?.models.blurNsfw ?? true}
            onCheckedChange={(blurNsfw) => update.mutate({ models: { blurNsfw } })}
            label="Blur NSFW thumbnails"
          />
        </Field>
      </div>
    </>
  );
}
