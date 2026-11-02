/**
 * Settings → About: who Blombo is (logo, version, GitHub, the Design Lab in dev mode), what this
 * install runs on, and this profile's folder plus export / import as a zip (services/backup.ts):
 * the workflows, layouts, settings, inputs and database go in; the trash and the Civitai key stay
 * out. Import makes a new profile.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { Logo } from "@client/icons/Logo";
import { api, profileExportUrl } from "@client/lib/api";
import { useGoToView } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import { isDesktop, openWindow } from "@client/lib/platform";
import { qk, useSystem } from "@client/lib/queries";
import {
  Badge,
  Button,
  DropZone,
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
import { type ReactNode, useState } from "react";
import { PageHeader, useCurrentProfile } from "./common";

const REPO = "https://github.com/nyaridev/BlomboUI";

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

export function AboutPage() {
  const system = useSystem().data;
  const profile = useCurrentProfile();
  const comfy = useLive((s) => s.comfy);
  const go = useGoToView();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [importing, setImporting] = useState(false);

  const state = comfy ? COMFY_STATE[comfy.state] : null;
  const facts: Property[] = [
    { label: "Version", value: system ? `v${system.version}` : null, mono: true },
    {
      label: "ComfyUI",
      value: (
        <span className="inline-flex items-center gap-2">
          <StatusDot tone={state?.tone ?? "neutral"} />
          {comfy
            ? `${comfy.version ? `ComfyUI ${comfy.version}` : "ComfyUI"} · ${state?.text}`
            : "Not connected"}
        </span>
      ),
    },
    {
      label: "Runs on",
      value: comfy
        ? comfy.mode === "external"
          ? comfy.url
          : comfy.dir
            ? "Your own folder"
            : `Managed install${comfy.slot ? ` (${comfy.slot})` : ""}`
        : null,
      mono: comfy?.mode === "external",
    },
    {
      label: "Platform",
      value: system
        ? `${PLATFORMS[system.platform] ?? system.platform} · ${isDesktop() ? "desktop window" : "browser"}`
        : null,
    },
    { label: "Data folder", value: system?.dataDir, mono: true, copy: system?.dataDir },
  ];

  const exportProfile = () => {
    if (!profile) return;
    // A plain link download: the browser saves it, the desktop window asks where.
    const a = document.createElement("a");
    a.href = profileExportUrl(profile.id);
    a.download = "";
    a.click();
    toast("Preparing the export. It downloads in a moment.", "info");
  };

  const importZip = async (file: File) => {
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
  };

  return (
    <>
      <PageHeader title="About" />
      <div className="flex flex-col gap-8">
        <Panel className="flex flex-col items-center gap-4 px-6 py-10 text-center">
          <Logo size={64} />
          <div className="flex flex-col items-center gap-1.5">
            <h2 className="text-2xl font-semibold tracking-tight text-fg">
              Blombo<span className="text-fg-3">UI</span>
            </h2>
            <p className="max-w-[46ch] text-sm text-fg-3 text-balance">
              A local studio for ComfyUI: profiles, workflows, a gallery and your models.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {system ? (
              <Badge tone="accent" className="font-mono">
                v{system.version}
              </Badge>
            ) : null}
            {system?.dev ? <Badge tone="warning">Development</Badge> : null}
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button icon="github" onClick={() => void openWindow(REPO, "BlomboUI on GitHub")}>
              View on GitHub
            </Button>
            {import.meta.env.DEV ? (
              <Button variant="ghost" icon="lab" onClick={() => go("lab")}>
                Design Lab
              </Button>
            ) : null}
          </div>
        </Panel>

        <section className="flex flex-col gap-3">
          <SectionTitle icon="info">This install</SectionTitle>
          <Panel className="p-5">
            <PropertyList items={facts} labelWidth={120} />
          </Panel>
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle icon="user">
            {profile ? `This profile · ${profile.name}` : "This profile"}
          </SectionTitle>
          <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-1">
            <ActionCard
              icon="folder-open"
              title="Profile folder"
              text="Workflows, layouts, settings and the database of this profile."
            >
              <Button
                icon="folder-open"
                onClick={() =>
                  void api
                    .revealProfileFolder()
                    .catch((e) => toast(String(e.message ?? e), "error"))
                }
              >
                Show in Explorer
              </Button>
            </ActionCard>
            <ActionCard
              icon="export"
              title="Export"
              text="A zip to back it up or move it to another PC. The trash and your Civitai key stay out."
            >
              <Button icon="export" disabled={!profile} onClick={exportProfile}>
                Export profile
              </Button>
            </ActionCard>
            <ActionCard
              icon="import"
              title="Import"
              text="Adds an exported profile next to your others, as a new profile."
            >
              <DropZone
                compact
                accept=".zip,application/zip"
                icon="import"
                busy={importing}
                title={importing ? "Importing…" : "Drop a .blombo-profile.zip or click to pick one"}
                onFile={(f) => void importZip(f)}
              />
            </ActionCard>
          </div>
        </section>
      </div>
    </>
  );
}

function ActionCard({
  icon,
  title,
  text,
  children,
}: {
  icon: IconName;
  title: string;
  text: string;
  children: ReactNode;
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
      <div>{children}</div>
    </Panel>
  );
}
