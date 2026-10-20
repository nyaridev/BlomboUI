/**
 * Settings → About: version, where this profile lives, the Design Lab, and export / import of a
 * whole profile as a zip (services/backup.ts): the workflows, layouts, settings, scopes, inputs
 * and database go in; the trash and the Civitai key stay out. Import makes a new profile.
 */
import { Icon } from "@client/icons/Icon";
import { api, profileExportUrl } from "@client/lib/api";
import { useGoToView } from "@client/lib/hooks";
import { qk, useSystem } from "@client/lib/queries";
import { Button, DropZone, Field, Panel, toast } from "@client/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, useCurrentProfile } from "./common";

export function AboutPage() {
  const system = useSystem().data;
  const profile = useCurrentProfile();
  const go = useGoToView();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [importing, setImporting] = useState(false);

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
      <PageHeader title="About" text="This copy of Blombo and this profile's files." />
      <div className="flex flex-col gap-8">
        <Panel className="flex items-center gap-4 p-5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-field text-accent-ink">
            <Icon name="sparkle" size={20} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-base font-semibold text-fg">
              {system?.app ?? "BlomboUI"}{" "}
              <span className="font-mono text-sm font-normal text-fg-3">{system?.version}</span>
            </span>
            <span className="truncate text-xs text-fg-3">
              Runs from its folder; everything it writes stays in{" "}
              <span className="font-mono">{system?.dataDir ?? "data/"}</span> and runtime/.
              {system?.dev ? " Development mode." : ""}
            </span>
          </div>
          <Button variant="ghost" icon="lab" onClick={() => go("lab")}>
            Design Lab
          </Button>
        </Panel>

        <Field
          label="Profile folder"
          layout="left"
          hint="Workflows, layouts, settings, scopes and the database of this profile."
        >
          <div className="flex items-center gap-2">
            <Button
              icon="folder-open"
              onClick={() =>
                void api.revealProfileFolder().catch((e) => toast(String(e.message ?? e), "error"))
              }
            >
              Show in Explorer
            </Button>
          </div>
        </Field>

        <Field
          label="Export this profile"
          layout="left"
          hint="One zip with everything above, to back it up or move it to another PC. The trash and your Civitai key aren't included; models, outputs and wildcards stay in their folders."
        >
          <Button
            icon="export"
            disabled={!profile}
            onClick={() => {
              if (!profile) return;
              // A plain link download: the browser saves it, the desktop window asks where.
              const a = document.createElement("a");
              a.href = profileExportUrl(profile.id);
              a.download = "";
              a.click();
              toast("Preparing the export. It downloads in a moment.", "info");
            }}
          >
            Export “{profile?.name ?? "profile"}”
          </Button>
        </Field>

        <Field
          label="Import a profile"
          layout="left"
          hint="Adds the exported profile next to your others, under a new name if this one is taken. Set its folders in Settings → Folders after opening it."
        >
          <DropZone
            compact
            accept=".zip,application/zip"
            icon="import"
            busy={importing}
            title={importing ? "Importing…" : "Drop a .blombo-profile.zip or click to pick one"}
            onFile={(f) => void importZip(f)}
          />
        </Field>
      </div>
    </>
  );
}
