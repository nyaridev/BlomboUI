/**
 * Workflow switcher: a pill in the header that opens a searchable picker of the profile's
 * workflows, built-in presets to add, quick actions, and a drop target for importing ComfyUI
 * workflows (ADR-0003).
 */
import { useImportFlow } from "@client/features/generate/importFlow";
import { useActiveChoice, useActiveWorkflow } from "@client/features/generate/workflow";
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import {
  useDeleteWorkflow,
  useDuplicateWorkflow,
  useInstallPreset,
  usePresets,
  useWorkflows,
} from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Art, Badge, Button, IconButton, Popover, TextField, toast } from "@client/ui";
import type { WorkflowSummary } from "@shared/workflow/manifest";
import { useMemo, useState } from "react";

const GROUPS: Array<{ id: string; label: string; match: (w: WorkflowSummary) => boolean }> = [
  {
    id: "gen",
    label: "Generate",
    match: (w) => w.kind === "generate" && !w.tags.includes("imported"),
  },
  {
    id: "imp",
    label: "Imported",
    match: (w) => w.kind === "generate" && w.tags.includes("imported"),
  },
  { id: "util", label: "Utilities", match: (w) => w.kind === "batch" },
];

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function WorkflowSwitcher() {
  const active = useActiveWorkflow();
  const workflows = useWorkflows();
  const presets = usePresets();
  const profileId = useSession((s) => s.profileId);
  const choose = useActiveChoice((s) => s.choose);
  const install = useInstallPreset();
  const duplicate = useDuplicateWorkflow();
  const remove = useDeleteWorkflow();
  const [query, setQuery] = useState("");
  const [armDelete, setArmDelete] = useState(false);
  const current = active.manifest;
  const { pickFile, dropProps, dragging, busy } = useImportFlow();

  const groups = useMemo(() => {
    const all = workflows.data ?? [];
    const q = query.trim().toLowerCase();
    if (q) {
      const list = all.filter((w) => `${w.name} ${w.family}`.toLowerCase().includes(q));
      return [
        {
          id: "results",
          label: `${list.length} result${list.length === 1 ? "" : "s"}`,
          items: list,
        },
      ];
    }
    return GROUPS.map((g) => ({ ...g, items: all.filter(g.match) })).filter((g) => g.items.length);
  }, [workflows.data, query]);
  const available = (presets.data ?? []).filter((p) => !p.installed);

  const select = (id: string) => {
    if (profileId) choose(profileId, id);
  };

  return (
    <Popover
      placement="bottom-start"
      className="w-[440px] p-0"
      onOpenChange={(o) => !o && setArmDelete(false)}
      trigger={
        <button
          type="button"
          className="group flex h-9 max-w-[280px] items-center gap-2.5 rounded-lg border border-line bg-field pr-2.5 pl-1 transition-colors hover:border-line-strong data-[open]:border-accent/60 focus-ring"
        >
          <Art seed={current?.id ?? "none"} className="h-7 w-7 shrink-0 rounded-md" />
          <span className="flex min-w-0 flex-col text-left leading-tight">
            <span className="truncate text-sm font-medium text-fg">
              {current?.name ?? "No workflow"}
            </span>
            <span className="truncate text-2xs text-fg-3">
              {current ? `${current.family} workflow` : "Add one to start"}
            </span>
          </span>
          <Icon
            name="chevrons-up-down"
            size={14}
            className="ml-1 text-fg-3 group-hover:text-fg-2"
          />
        </button>
      }
    >
      {(close) => (
        <div className="relative flex max-h-[min(72vh,620px)] flex-col" {...dropProps}>
          <div className="flex items-center gap-2 border-b border-line p-2.5">
            <TextField
              autoFocus
              icon="search"
              placeholder="Search workflows"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery("")}
              className="flex-1"
            />
            <IconButton
              icon="import"
              label="Import ComfyUI workflow"
              variant="secondary"
              disabled={busy}
              onClick={pickFile}
            />
          </div>

          <div className="scroll-quiet min-h-0 flex-1 overflow-auto p-1.5">
            {groups.length === 0 && !query ? (
              <p className="px-3 py-4 text-center text-xs text-fg-3">
                No workflows in this profile yet. Add a built-in one below, or drop a ComfyUI
                workflow here.
              </p>
            ) : null}
            {groups.map((g) => (
              <div key={g.id} className="mb-1">
                <div className="label-caps px-2.5 pt-2 pb-1.5 text-[10px]">{g.label}</div>
                {g.items.map((w) => {
                  const on = w.id === current?.id;
                  return (
                    <button
                      key={`${g.id}-${w.id}`}
                      type="button"
                      onClick={() => {
                        select(w.id);
                        close();
                      }}
                      className={cn(
                        "group/row flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors focus-ring",
                        on ? "bg-accent/12" : "hover:bg-field",
                      )}
                    >
                      <Art seed={w.id} className="h-9 w-9 shrink-0 rounded-md" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span
                          className={cn(
                            "truncate text-sm",
                            on ? "font-medium text-fg" : "text-fg-2 group-hover/row:text-fg",
                          )}
                        >
                          {w.name}
                        </span>
                        <span className="flex items-center gap-1.5 text-2xs text-fg-3">
                          {w.family}
                          <span className="text-fg-4">·</span>
                          edited {ago(w.updatedAt)}
                        </span>
                      </span>
                      {w.preset ? <Badge>preset</Badge> : null}
                      {w.parentId ? <Badge>copy</Badge> : null}
                      {w.kind === "batch" ? <Badge tone="accent">batch</Badge> : null}
                    </button>
                  );
                })}
              </div>
            ))}
            {available.length && !query ? (
              <div className="mb-1">
                <div className="label-caps px-2.5 pt-2 pb-1.5 text-[10px]">
                  Add a built-in workflow
                </div>
                {available.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-md px-2 py-1.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-field text-fg-3">
                      <Icon name="generate" size={16} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-fg-2">{p.name}</span>
                      <span className="truncate text-2xs text-fg-3">{p.description}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="plus"
                      loading={install.isPending && install.variables === p.id}
                      onClick={() =>
                        install.mutate(p.id, {
                          onSuccess: (m) => {
                            select(m.id);
                            toast(`Added "${m.name}"`, "success");
                          },
                          onError: (e) => toast(e.message, "error"),
                        })
                      }
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-3 gap-1 border-t border-line p-1.5">
            <FooterAction
              icon="duplicate"
              label="Duplicate"
              disabled={!current}
              onClick={() =>
                current &&
                duplicate.mutate(
                  { id: current.id },
                  {
                    onSuccess: (m) => {
                      select(m.id);
                      toast(
                        `Duplicated as "${m.name}". Changes there stay in the copy.`,
                        "success",
                      );
                    },
                    onError: (e) => toast(e.message, "error"),
                  },
                )
              }
            />
            <FooterAction icon="import" label="Import…" disabled={busy} onClick={pickFile} />
            <FooterAction
              icon="trash"
              label={armDelete ? "Click to confirm" : "Delete"}
              danger={armDelete}
              disabled={!current}
              onClick={() => {
                if (!current) return;
                if (!armDelete) {
                  setArmDelete(true);
                  return;
                }
                setArmDelete(false);
                remove.mutate(current.id, {
                  onSuccess: () => toast(`Moved "${current.name}" to the profile's trash`, "info"),
                  onError: (e) => toast(e.message, "error"),
                });
              }}
            />
          </div>

          <div className="flex items-center border-t border-line px-3 py-2 text-2xs text-fg-3">
            <span className="flex items-center gap-1.5">
              <Icon name="import" size={12} /> Drop a ComfyUI .json, PNG or WebP here to import it
            </span>
          </div>

          {dragging ? (
            <div className="pointer-events-none absolute inset-1.5 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-surface-3/90">
              <div className="flex flex-col items-center gap-2 text-center">
                <Icon name="import" size={28} className="text-accent-ink" />
                <span className="text-sm font-medium text-fg">Drop to import workflow</span>
                <span className="text-xs text-fg-3">
                  API JSON, UI JSON, or a ComfyUI PNG / WebP
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Popover>
  );
}

function FooterAction({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: "duplicate" | "import" | "trash";
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors focus-ring disabled:opacity-40",
        danger ? "bg-red/12 text-red-ink" : "text-fg-2 hover:bg-field hover:text-fg",
      )}
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}
