/**
 * Settings → About: version, what this install runs on, where this profile lives, the Design Lab,
 * and export / import of a whole profile as a zip (services/backup.ts): the workflows, layouts,
 * settings, inputs and database go in; the trash and the Civitai key stay out. Import makes a new
 * profile. Three layouts are on trial behind the dev Layouts panel.
 */
import { Icon } from "@client/icons/Icon";
import { Logo } from "@client/icons/Logo";
import { api, profileExportUrl } from "@client/lib/api";
import { useGoToView } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import { isDesktop, openWindow } from "@client/lib/platform";
import { qk, useSystem } from "@client/lib/queries";
import { useVariant } from "@client/lib/variants";
import {
  Badge,
  Button,
  DropZone,
  Field,
  Panel,
  type Property,
  PropertyList,
  SectionTitle,
  StatusDot,
  type Tone,
  toast,
} from "@client/ui";
import type { ComfyState } from "@shared/comfy";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { PageHeader, useCurrentProfile } from "./common";

const REPO = "https://github.com/nyaridev/BlomboUI";
const TAGLINE = "A local studio for ComfyUI: profiles, workflows, a gallery and your models.";

const LAYOUTS = [
  { id: "hero", label: "Hero" },
  { id: "split", label: "Two columns" },
  { id: "list", label: "Grouped list" },
] as const;

const PLATFORMS: Record<string, string> = { win32: "Windows", darwin: "macOS", linux: "Linux" };

const COMFY_STATE: Record<ComfyState, { text: string; tone: Tone }> = {
  running: { text: "running", tone: "success" },
  starting: { text: "starting", tone: "warning" },
  restarting: { text: "restarting", tone: "warning" },
  stopping: { text: "stopping", tone: "warning" },
  stopped: { text: "stopped", tone: "neutral" },
  crashed: { text: "crashed", tone: "danger" },
  missing: { text: "not installed", tone: "danger" },
  unreachable: { text: "not answering", tone: "danger" },
};

/** Everything the layouts show and do. */
function useAbout() {
  const system = useSystem().data;
  const profile = useCurrentProfile();
  const comfy = useLive((s) => s.comfy);
  const go = useGoToView();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [importing, setImporting] = useState(false);

  const state = comfy ? COMFY_STATE[comfy.state] : null;
  const comfyText = comfy
    ? `${comfy.version ? `ComfyUI ${comfy.version}` : "ComfyUI"} · ${state?.text}`
    : "Not connected";
  const comfyWhere = comfy
    ? comfy.mode === "external"
      ? comfy.url
      : comfy.dir
        ? "Your own folder"
        : `Managed install${comfy.slot ? ` (${comfy.slot})` : ""}`
    : null;

  const facts: Property[] = [
    { label: "Version", value: system ? `v${system.version}` : null, mono: true },
    {
      label: "ComfyUI",
      value: (
        <span className="inline-flex items-center gap-2">
          <StatusDot tone={state?.tone ?? "neutral"} />
          {comfyText}
        </span>
      ),
    },
    { label: "Runs on", value: comfyWhere, mono: comfy?.mode === "external" },
    {
      label: "Platform",
      value: system
        ? `${PLATFORMS[system.platform] ?? system.platform} · ${isDesktop() ? "desktop window" : "browser"}`
        : null,
    },
    { label: "Data folder", value: system?.dataDir, mono: true, copy: system?.dataDir },
  ];

  return {
    system,
    profile,
    facts,
    comfyText,
    comfyTone: state?.tone ?? ("neutral" as Tone),
    importing,
    openRepo: () => void openWindow(REPO, "BlomboUI on GitHub"),
    openLab: import.meta.env.DEV ? () => go("lab") : null,
    reveal: () =>
      void api.revealProfileFolder().catch((e) => toast(String(e.message ?? e), "error")),
    exportProfile: () => {
      if (!profile) return;
      // A plain link download: the browser saves it, the desktop window asks where.
      const a = document.createElement("a");
      a.href = profileExportUrl(profile.id);
      a.download = "";
      a.click();
      toast("Preparing the export. It downloads in a moment.", "info");
    },
    importZip: async (file: File) => {
      setImporting(true);
      try {
        const p = await api.importProfile(file);
        await qc.invalidateQueries({ queryKey: qk.profiles });
        toast(`Imported “${p.name}” as a new profile`, "success", {
          label: "Open it",
          run: () => void navigate({ to: "/p/$profileId", params: { profileId: p.id } }),
        });
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
      } finally {
        setImporting(false);
      }
    },
  };
}
type About = ReturnType<typeof useAbout>;

export function AboutPage() {
  const layout = useVariant("about", "About", LAYOUTS);
  const about = useAbout();
  return (
    <>
      <PageHeader title="About" />
      {layout === "hero" ? (
        <HeroLayout a={about} />
      ) : layout === "split" ? (
        <SplitLayout a={about} />
      ) : (
        <ListLayout a={about} />
      )}
    </>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────── */

const EXPORT_HINT =
  "One zip with this profile's workflows, layouts, settings and history, to back it up or move it to another PC. The trash and your Civitai key stay out; models, outputs and wildcards stay in their folders.";
const IMPORT_HINT =
  "Adds an exported profile next to your others, under a new name if this one is taken. Set its folders after opening it.";

const profileTitle = (a: About) =>
  a.profile ? `This profile · ${a.profile.name}` : "This profile";

function Links({ a, full }: { a: About; full?: boolean }) {
  return (
    <>
      <Button icon="github" onClick={a.openRepo} className={full ? "w-full" : undefined}>
        View on GitHub
      </Button>
      {a.openLab ? (
        <Button
          variant="ghost"
          icon="lab"
          onClick={a.openLab}
          className={full ? "w-full" : undefined}
        >
          Design Lab
        </Button>
      ) : null}
    </>
  );
}

function VersionBadges({ a }: { a: About }) {
  return (
    <>
      {a.system ? (
        <Badge tone="accent" className="font-mono">
          v{a.system.version}
        </Badge>
      ) : null}
      {a.system?.dev ? <Badge tone="warning">Development</Badge> : null}
    </>
  );
}

function ImportZone({ a, compact }: { a: About; compact?: boolean }) {
  return (
    <DropZone
      compact={compact}
      accept=".zip,application/zip"
      icon="import"
      busy={a.importing}
      title={a.importing ? "Importing…" : "Drop a .blombo-profile.zip or click to pick one"}
      hint={compact ? undefined : IMPORT_HINT}
      onFile={(f) => void a.importZip(f)}
    />
  );
}

/* ── 1. Hero: a centered identity card, the install facts, three profile actions ── */

function HeroLayout({ a }: { a: About }) {
  return (
    <div className="flex flex-col gap-8">
      <Panel className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <Logo size={64} />
        <div className="flex flex-col items-center gap-1.5">
          <h2 className="text-2xl font-semibold tracking-tight text-fg">
            Blombo<span className="text-fg-3">UI</span>
          </h2>
          <p className="max-w-[46ch] text-sm text-fg-3 text-balance">{TAGLINE}</p>
        </div>
        <div className="flex items-center gap-2">
          <VersionBadges a={a} />
        </div>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Links a={a} />
        </div>
      </Panel>

      <section className="flex flex-col gap-3">
        <SectionTitle icon="info">This install</SectionTitle>
        <Panel className="p-5">
          <PropertyList items={a.facts} labelWidth={120} />
        </Panel>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle icon="user">{profileTitle(a)}</SectionTitle>
        <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1">
          <ActionCard
            icon="folder-open"
            title="Profile folder"
            text="Workflows, layouts, settings and the database of this profile."
            action={
              <Button icon="folder-open" onClick={a.reveal}>
                Show in Explorer
              </Button>
            }
          />
          <ActionCard
            icon="export"
            title="Export"
            text="A zip to back it up or move it to another PC. The trash and your Civitai key stay out."
            action={
              <Button icon="export" disabled={!a.profile} onClick={a.exportProfile}>
                Export profile
              </Button>
            }
          />
          <ActionCard
            icon="import"
            title="Import"
            text="Adds an exported profile next to your others, as a new profile."
            action={<ImportZone a={a} compact />}
          />
        </div>
      </section>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  text,
  action,
}: {
  icon: "folder-open" | "export" | "import";
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-field text-accent-ink">
          <Icon name={icon} size={16} />
        </span>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
      </div>
      <p className="flex-1 text-xs text-fg-3 text-pretty">{text}</p>
      <div>{action}</div>
    </Panel>
  );
}

/* ── 2. Two columns: identity on the left, settings-style rows on the right ── */

function SplitLayout({ a }: { a: About }) {
  return (
    <div className="grid grid-cols-[260px_minmax(0,1fr)] items-start gap-8 max-lg:grid-cols-1">
      <Panel className="flex flex-col gap-5 p-6 lg:sticky lg:top-0">
        <Logo size={48} />
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight text-fg">
            Blombo<span className="text-fg-3">UI</span>
          </h2>
          <p className="text-xs text-fg-3 text-pretty">{TAGLINE}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VersionBadges a={a} />
        </div>
        <div className="flex items-center gap-2 text-xs text-fg-2">
          <StatusDot tone={a.comfyTone} />
          {a.comfyText}
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-5">
          <Links a={a} full />
        </div>
      </Panel>

      <div className="flex flex-col gap-10">
        <section className="flex flex-col gap-4">
          <SectionTitle icon="info">This install</SectionTitle>
          <PropertyList items={a.facts} labelWidth={120} />
        </section>
        <section className="flex flex-col gap-5">
          <SectionTitle icon="user">Back up and move</SectionTitle>
          <Field
            label="Profile folder"
            layout="left"
            hint="Workflows, layouts, settings and the database of this profile."
          >
            <div>
              <Button icon="folder-open" onClick={a.reveal}>
                Show in Explorer
              </Button>
            </div>
          </Field>
          <Field label="Export this profile" layout="left" hint={EXPORT_HINT}>
            <div>
              <Button icon="export" disabled={!a.profile} onClick={a.exportProfile}>
                Export “{a.profile?.name ?? "profile"}”
              </Button>
            </div>
          </Field>
          <Field label="Import a profile" layout="left" hint={IMPORT_HINT}>
            <ImportZone a={a} compact />
          </Field>
        </section>
      </div>
    </div>
  );
}

/* ── 3. Grouped list: a header line, then panels of label / value rows ── */

function ListLayout({ a }: { a: About }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4 max-lg:flex-wrap">
        <Logo size={52} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-fg">
              Blombo<span className="text-fg-3">UI</span>
            </h2>
            <VersionBadges a={a} />
          </div>
          <p className="text-xs text-fg-3">{TAGLINE}</p>
        </div>
        <div className="flex gap-2 max-lg:basis-full">
          <Links a={a} />
        </div>
      </div>

      <Group title="This install">
        {a.facts
          .filter((f) => f.value)
          .map((f) => (
            <Row key={f.label} title={f.label}>
              <span
                className={
                  f.mono ? "truncate font-mono text-xs text-fg-2" : "truncate text-sm text-fg-2"
                }
                title={typeof f.value === "string" ? f.value : undefined}
              >
                {f.value}
              </span>
            </Row>
          ))}
      </Group>

      <Group title={profileTitle(a)}>
        <Row title="Profile folder" hint="Workflows, layouts, settings and the database.">
          <Button size="sm" icon="folder-open" onClick={a.reveal}>
            Show in Explorer
          </Button>
        </Row>
        <Row title="Export" hint="A zip to back it up or move it. No trash, no Civitai key.">
          <Button size="sm" icon="export" disabled={!a.profile} onClick={a.exportProfile}>
            Export profile
          </Button>
        </Row>
        <div className="flex flex-col gap-2.5 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-sm text-fg">Import</span>
            <span className="text-xs text-fg-3">{IMPORT_HINT}</span>
          </div>
          <ImportZone a={a} compact />
        </div>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="label-caps px-1">{title}</h3>
      <Panel className="flex flex-col divide-y divide-line">{children}</Panel>
    </section>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-4 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm text-fg">{title}</span>
        {hint ? <span className="text-xs text-fg-3">{hint}</span> : null}
      </div>
      <div className="flex min-w-0 max-w-[60%] justify-end">{children}</div>
    </div>
  );
}
