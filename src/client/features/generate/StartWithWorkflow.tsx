/**
 * Generate with no workflows yet: add a built-in one or import a ComfyUI workflow. The same
 * import (drop a .json, PNG or WebP) also works from the workflow picker in the header.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useInstallPreset, usePresets } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Badge, Button, Spinner, toast } from "@client/ui";
import { useImportFlow } from "./importFlow";
import { useActiveChoice } from "./workflow";

export function StartWithWorkflow() {
  const presets = usePresets();
  const install = useInstallPreset();
  const choose = useActiveChoice((s) => s.choose);
  const profileId = useSession((s) => s.profileId);
  const { pickFile, dropProps, dragging, busy } = useImportFlow();

  return (
    <div className="grid h-full place-items-center p-6" {...dropProps}>
      <div className="flex w-full max-w-xl flex-col gap-5">
        <div className="flex flex-col gap-1.5 text-center">
          <h2 className="text-lg font-semibold text-balance text-fg">
            Add a workflow to start generating
          </h2>
          <p className="text-sm text-fg-3">
            Workflows are ComfyUI graphs. Start from a built-in one, or bring your own: drop a
            workflow .json, or a PNG / WebP made by ComfyUI.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-2 p-2">
          {presets.isLoading ? (
            <div className="grid h-24 place-items-center text-fg-3">
              <Spinner />
            </div>
          ) : (
            (presets.data ?? []).map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-field"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-field text-fg-2">
                  <Icon name="generate" size={17} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 text-sm font-medium text-fg">
                    {p.name} <Badge>{p.family}</Badge>
                  </span>
                  <span className="truncate text-xs text-fg-3">{p.description}</span>
                </span>
                <Button
                  size="sm"
                  icon="plus"
                  loading={install.isPending && install.variables === p.id}
                  onClick={() =>
                    install.mutate(p.id, {
                      onSuccess: (m) => {
                        if (profileId) choose(profileId, m.id);
                        toast(`Added "${m.name}"`, "success");
                      },
                      onError: (e) => toast(e.message, "error"),
                    })
                  }
                >
                  Add
                </Button>
              </div>
            ))
          )}
        </div>
        <div
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors",
            dragging ? "border-accent bg-accent/10" : "border-line",
          )}
        >
          <Icon name="import" size={22} className="text-fg-3" />
          <span className="text-sm text-fg-2">Drop a ComfyUI workflow here</span>
          <Button size="sm" variant="ghost" icon="upload" loading={busy} onClick={pickFile}>
            Choose a file
          </Button>
        </div>
      </div>
    </div>
  );
}
