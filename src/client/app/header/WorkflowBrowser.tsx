/**
 * The workflows window, opened from the header's workflow button: a dialog in the middle of the
 * screen (like ComfyUI's workflow browser) with sections on the left, search and Import on top
 * and the profile's workflows as cards. A click switches to one; its ⋯ button or a right-click
 * has Edit in ComfyUI, Duplicate, Export and Delete. Built-in presets the profile doesn't have
 * are cards with Add. ComfyUI workflows and .blombo files dropped anywhere on it are imported
 * (ADR-0003, ADR-0009).
 */
import { editInComfy, exportWorkflow } from "@client/features/generate/bridge";
import { useImportFlow } from "@client/features/generate/importFlow";
import { useActiveChoice, useActiveWorkflow } from "@client/features/generate/workflow";
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import {
  useDeleteWorkflow,
  useDuplicateWorkflow,
  useInstallPreset,
  usePresets,
  useWorkflows,
} from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Art, Button, Dialog, type MenuEntry, openContextMenu, TextField, toast } from "@client/ui";
import type { WorkflowSummary } from "@shared/workflow/manifest";
import { type MouseEvent, useMemo, useState } from "react";

type Section = "all" | "gen" | "imp" | "util" | "builtin";

const GROUPS: Array<{
  id: Exclude<Section, "all" | "builtin">;
  label: string;
  icon: IconName;
  match: (w: WorkflowSummary) => boolean;
}> = [
  {
    id: "gen",
    label: "Generate",
    icon: "generate",
    match: (w) => w.kind === "generate" && !w.tags.includes("imported"),
  },
  {
    id: "imp",
    label: "Imported",
    icon: "import",
    match: (w) => w.kind === "generate" && w.tags.includes("imported"),
  },
  { id: "util", label: "Utilities", icon: "stack", match: (w) => w.kind === "batch" },
];

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function WorkflowBrowser({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Workflows" width={1080} bare>
      {open ? <Browser close={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function Browser({ close }: { close: () => void }) {
  const current = useActiveWorkflow().manifest;
  const workflows = useWorkflows();
  const presets = usePresets();
  const profileId = useSession((s) => s.profileId);
  const choose = useActiveChoice((s) => s.choose);
  const install = useInstallPreset();
  const duplicate = useDuplicateWorkflow();
  const remove = useDeleteWorkflow();
  const [section, setSection] = useState<Section>("all");
  const [query, setQuery] = useState("");
  // Asked in the bottom bar: a second dialog's Escape would close this one too.
  const [toDelete, setToDelete] = useState<WorkflowSummary | null>(null);
  const { pickFile, dropProps, dragging, busy } = useImportFlow(() => close());

  const all = workflows.data ?? [];
  const available = (presets.data ?? []).filter((p) => !p.installed);
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (q) {
      const list = all.filter((w) => `${w.name} ${w.family}`.toLowerCase().includes(q));
      return [{ id: "results", label: "", items: list }];
    }
    return GROUPS.filter((g) => section === "all" || section === g.id)
      .map((g) => ({
        id: g.id,
        label: section === "all" ? g.label : "",
        items: all.filter(g.match),
      }))
      .filter((g) => g.items.length);
  }, [all, q, section]);
  const showBuiltin = !q && (section === "all" || section === "builtin") && available.length > 0;

  const select = (id: string) => {
    if (profileId) choose(profileId, id);
    close();
  };
  const menu = (e: MouseEvent<HTMLElement>, w: WorkflowSummary) => {
    const items: MenuEntry[] = [
      { id: "use", label: "Use this workflow", icon: "check", onSelect: () => select(w.id) },
      { type: "separator", id: "s1" },
      {
        id: "comfy",
        label: "Edit in ComfyUI",
        icon: "external",
        onSelect: () => {
          close();
          void editInComfy(w.id);
        },
      },
      {
        id: "dup",
        label: "Duplicate",
        icon: "duplicate",
        onSelect: () =>
          duplicate.mutate(
            { id: w.id },
            {
              onSuccess: (m) =>
                toast(`Duplicated as "${m.name}". Changes there stay in the copy.`, "success"),
              onError: (err) => toast(err.message, "error"),
            },
          ),
      },
      {
        id: "export",
        label: "Export as .blombo",
        icon: "export",
        onSelect: () => {
          exportWorkflow(w.id);
          toast(`Exporting "${w.name}" as a .blombo file`, "info");
        },
      },
      { type: "separator", id: "s2" },
      {
        id: "delete",
        label: "Delete…",
        icon: "trash",
        tone: "danger",
        onSelect: () => setToDelete(w),
      },
    ];
    openContextMenu(e, items);
  };

  const counts: Record<string, number> = {
    all: all.length,
    builtin: available.length,
    ...Object.fromEntries(GROUPS.map((g) => [g.id, all.filter(g.match).length])),
  };
  const sections: Array<{ id: Section; label: string; icon: IconName }> = [
    { id: "all", label: "All workflows", icon: "workflow" },
    ...GROUPS.map((g) => ({ id: g.id, label: g.label, icon: g.icon })),
    { id: "builtin", label: "Built-in to add", icon: "plus" },
  ];

  return (
    <div className="relative flex h-[min(72vh,680px)] min-h-0" {...dropProps}>
      <nav
        aria-label="Workflow sections"
        className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-line bg-surface p-2 max-md:hidden"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={section === s.id && !q ? "true" : undefined}
            onClick={() => {
              setSection(s.id);
              setQuery("");
            }}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors focus-ring",
              section === s.id && !q
                ? "bg-field font-medium text-fg"
                : "text-fg-2 hover:bg-field/60 hover:text-fg",
            )}
          >
            <Icon name={s.icon} size={15} className="shrink-0 text-fg-3" />
            <span className="flex-1 truncate">{s.label}</span>
            <span className="text-2xs text-fg-3 tabular">{counts[s.id]}</span>
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line p-3">
          <TextField
            autoFocus
            icon="search"
            placeholder="Search workflows"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            onKeyDown={(e) => {
              const first = groups[0]?.items[0];
              if (e.key === "Enter" && first) select(first.id);
            }}
            className="flex-1"
          />
          <Button variant="secondary" icon="import" loading={busy} onClick={pickFile}>
            Import
          </Button>
        </div>

        <div className="scroll-quiet min-h-0 flex-1 overflow-auto p-3">
          {all.length === 0 && !q && section !== "builtin" ? (
            <p className="px-3 py-6 text-center text-sm text-fg-3">
              No workflows in this profile yet. Add a built-in one, or drop a ComfyUI workflow here.
            </p>
          ) : null}
          {q && !groups[0]?.items.length ? (
            <p className="px-3 py-6 text-center text-sm text-fg-3">
              No workflow matches "{query.trim()}".
            </p>
          ) : null}
          {groups.map((g) => (
            <section key={g.id} className="mb-4 last:mb-0">
              {g.label ? <h3 className="label-caps px-0.5 pb-2 text-[10px]">{g.label}</h3> : null}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 max-md:grid-cols-2 max-md:gap-2">
                {g.items.map((w) => (
                  <WorkflowCard
                    key={w.id}
                    workflow={w}
                    active={w.id === current?.id}
                    onSelect={() => select(w.id)}
                    onMenu={(e) => menu(e, w)}
                  />
                ))}
              </div>
            </section>
          ))}
          {showBuiltin ? (
            <section>
              {section === "all" ? (
                <h3 className="label-caps px-0.5 pb-2 text-[10px]">Add a built-in workflow</h3>
              ) : null}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 max-md:grid-cols-2 max-md:gap-2">
                {available.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col overflow-hidden rounded-lg border border-dashed border-line-strong bg-surface"
                  >
                    <Art seed={p.id} ratio={16 / 9} className="grid place-items-center">
                      <span className="grid h-9 w-9 place-items-center rounded-md bg-black/60 text-white">
                        <Icon name="plus" size={18} />
                      </span>
                    </Art>
                    <div className="flex flex-1 flex-col gap-2 p-2.5">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium text-fg">{p.name}</span>
                        <span className="line-clamp-2 text-2xs text-fg-3">{p.description}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon="plus"
                        className="mt-auto self-start"
                        loading={install.isPending && install.variables === p.id}
                        onClick={() =>
                          install.mutate(p.id, {
                            onSuccess: (m) => {
                              toast(`Added "${m.name}"`, "success");
                              select(m.id);
                            },
                            onError: (e) => toast(e.message, "error"),
                          })
                        }
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {toDelete ? (
          <div className="flex items-center gap-2 border-t border-line bg-red/10 px-3 py-1.5 text-sm">
            <Icon name="trash" size={14} className="shrink-0 text-red-ink" />
            <span className="min-w-0 flex-1 truncate text-fg">
              Move "{toDelete.name}" to the profile's trash folder?
            </span>
            <Button size="sm" variant="ghost" autoFocus onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                const w = toDelete;
                setToDelete(null);
                remove.mutate(w.id, {
                  onSuccess: () => toast(`Moved "${w.name}" to the profile's trash`, "info"),
                  onError: (e) => toast(e.message, "error"),
                });
              }}
            >
              Move to trash
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 border-t border-line px-3 py-2 text-2xs text-fg-3">
            <Icon name="import" size={12} />
            Drop a ComfyUI .json, PNG, WebP or a .blombo file here to import it. Right-click a
            workflow for more.
          </div>
        )}
      </div>

      {dragging ? (
        <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-surface-3/90">
          <div className="flex flex-col items-center gap-2 text-center">
            <Icon name="import" size={28} className="text-accent-ink" />
            <span className="text-sm font-medium text-fg">Drop to import workflow</span>
            <span className="text-xs text-fg-3">
              API JSON, UI JSON, a ComfyUI PNG / WebP, or .blombo
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkflowCard({
  workflow: w,
  active,
  onSelect,
  onMenu,
}: {
  workflow: WorkflowSummary;
  active: boolean;
  onSelect: () => void;
  onMenu: (e: MouseEvent<HTMLElement>) => void;
}) {
  return (
    <div
      onContextMenu={onMenu}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-surface transition-[border-color,box-shadow]",
        active ? "border-transparent ring-2 ring-accent" : "border-line hover:border-line-strong",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className="flex flex-col text-left focus-ring"
      >
        <Art seed={w.id} ratio={16 / 9} className="w-full" />
        <span className="flex min-w-0 flex-col gap-0.5 p-2.5">
          <span className="truncate text-sm font-medium text-fg">{w.name}</span>
          <span className="truncate text-2xs text-fg-3">
            {w.family} · edited {ago(w.updatedAt)}
          </span>
        </span>
      </button>
      {/* Dark chips: badges' tints don't read on a picture. */}
      <span className="pointer-events-none absolute top-2 left-2 flex gap-1 text-2xs leading-5 text-white">
        {active ? (
          <span className="flex items-center gap-1 rounded-xs bg-black/75 px-1.5 font-medium">
            <Icon name="check" size={11} />
            In use
          </span>
        ) : null}
        {[w.preset && "preset", w.parentId && "copy", w.kind === "batch" && "batch"]
          .filter(Boolean)
          .map((t) => (
            <span key={String(t)} className="rounded-xs bg-black/75 px-1.5">
              {t}
            </span>
          ))}
      </span>
      <button
        type="button"
        aria-label={`More for ${w.name}`}
        onClick={onMenu}
        className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-md bg-black/60 text-white/85 opacity-0 transition-opacity hover:text-white focus-ring group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
      >
        <Icon name="more-horizontal" size={15} />
      </button>
    </div>
  );
}
