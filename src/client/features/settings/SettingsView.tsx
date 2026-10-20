/**
 * Settings: centered, organized pages with a searchable rail. Overview first: the profile, what
 * it has made (job log and gallery) and the settings people change most. Appearance is live
 * (theme and accent save to the profile; font, motion and NSFW blur to its settings).
 */
import { useTheme } from "@client/app/theme";
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { snappy } from "@client/lib/motion";
import { useSettings, useUpdateProfile, useUpdateSettings } from "@client/lib/queries";
import { Field, Segmented, Slider, Switch, TextField } from "@client/ui";
import { ACCENTS, THEME_LABELS, THEMES } from "@shared/constants";
import {
  fontStack,
  type MotionPref,
  UI_FONT_LABELS,
  UI_FONTS,
  type UiFont,
} from "@shared/settings";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { AboutPage } from "./AboutPage";
import { AutocompletePage } from "./AutocompletePage";
import { CivitaiPage } from "./CivitaiPage";
import { ComfyPage } from "./ComfyPage";
import { PageHeader, useCurrentProfile } from "./common";
import { FoldersPage } from "./FoldersPage";
import { GeneratePage } from "./GeneratePage";
import { NotificationsPage } from "./NotificationsPage";
import { type SettingsPage as PageId, SETTINGS_PAGES, useSettingsNav } from "./nav";
import { OverviewPage } from "./OverviewPage";
import { ShortcutsPage } from "./ShortcutsPage";

export function SettingsView() {
  const page = useSettingsNav((s) => s.page);
  const setPage = useSettingsNav((s) => s.go);
  const profile = useCurrentProfile();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const pages = SETTINGS_PAGES.filter(
    (p) => !q || p.label.toLowerCase().includes(q) || p.keywords.includes(q),
  );
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && pages[0]) setPage(pages[0].id);
            }}
            onClear={() => setQuery("")}
            className="mb-3"
          />
          {pages.length === 0 ? (
            <p className="px-2.5 text-xs text-fg-3">No page matches “{query}”.</p>
          ) : null}
          {pages.map((p, i) => (
            <div key={p.id}>
              {p.group && p.group !== pages[i - 1]?.group ? (
                <div className="label-caps px-2.5 pt-4 pb-1.5 text-[10px]">{p.group}</div>
              ) : null}
              <button
                type="button"
                onClick={() => setPage(p.id)}
                aria-current={page === p.id ? "page" : undefined}
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
          <Page page={page} onGo={setPage} profile={profile} />
        </motion.div>
      </div>
    </div>
  );
}

function Page({
  page,
  onGo,
  profile,
}: {
  page: PageId;
  onGo: (p: PageId) => void;
  profile: ReturnType<typeof useCurrentProfile>;
}) {
  switch (page) {
    case "overview":
      return <OverviewPage onGo={onGo} />;
    case "appearance":
      return <Appearance />;
    case "files":
      return (
        <>
          <PageHeader
            title="Folders"
            text="Where this profile's models, images and wildcards live."
          />
          <FoldersPage profile={profile} />
        </>
      );
    case "generate":
      return <GeneratePage onGo={onGo} />;
    case "comfy":
      return (
        <>
          <PageHeader
            title="ComfyUI"
            text="The engine that generates. Blombo can install and run it for you."
          />
          <ComfyPage profile={profile} />
        </>
      );
    case "gallery":
      return <GalleryPage />;
    case "models":
      return <ModelsPage />;
    case "autocomplete":
      return (
        <AutocompletePage
          header={
            <PageHeader
              title="Autocomplete"
              text="What the prompt editor suggests and how it goes in. Saved to this profile."
            />
          }
        />
      );
    case "civitai":
      return (
        <CivitaiPage
          header={
            <PageHeader
              title="Civitai"
              text="Your account, browsing, where downloads land, and what Blombo remembers."
            />
          }
        />
      );
    case "notifications":
      return <NotificationsPage />;
    case "shortcuts":
      return <ShortcutsPage />;
    case "about":
      return <AboutPage />;
  }
}

function Appearance() {
  const profile = useCurrentProfile();
  const update = useUpdateProfile();
  const preview = useTheme((s) => s.set);
  const theme = useTheme((s) => s.theme);
  const accent = useTheme((s) => s.accent);
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
          hint="Reduced keeps fades but drops movement. System follows Windows (Settings → Accessibility → Visual effects)."
        >
          <Segmented
            value={settings?.appearance.motion ?? "system"}
            onChange={(m: MotionPref) => {
              preview({ motion: m });
              updateSettings.mutate({ appearance: { motion: m } });
            }}
            options={[
              { value: "full", label: "Full" },
              { value: "reduced", label: "Reduced" },
              { value: "system", label: "System" },
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
