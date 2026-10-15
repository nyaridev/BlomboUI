/**
 * Workflow switcher: a pill in the header that opens a searchable picker with favorites,
 * categories, quick actions and a drop target for importing ComfyUI workflows (ADR-0003).
 */
import { MOCK_WORKFLOWS, type MockWorkflow } from "@client/features/preview/mock";
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { openWindow } from "@client/lib/platform";
import { Art, Badge, IconButton, Kbd, Popover, TextField, toast } from "@client/ui";
import { PORTS } from "@shared/constants";
import { useMemo, useState } from "react";
import { create } from "zustand";

const useCurrentWorkflow = create<{ id: string; set: (id: string) => void }>((set) => ({
  id: "illustrious-portrait",
  set: (id) => set({ id }),
}));

export function useWorkflowPreview() {
  const id = useCurrentWorkflow((s) => s.id);
  return MOCK_WORKFLOWS.find((w) => w.id === id) ?? (MOCK_WORKFLOWS[0] as MockWorkflow);
}

const GROUPS: Array<{ id: string; label: string; match: (w: MockWorkflow) => boolean }> = [
  { id: "fav", label: "Favorites", match: (w) => Boolean(w.favorite) },
  { id: "gen", label: "Generate", match: (w) => w.kind === "generate" && w.family !== "Imported" },
  { id: "imp", label: "Imported", match: (w) => w.family === "Imported" },
  { id: "util", label: "Utilities", match: (w) => w.kind === "batch" },
];

export function WorkflowSwitcher() {
  const current = useWorkflowPreview();
  const setCurrent = useCurrentWorkflow((s) => s.set);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? MOCK_WORKFLOWS.filter((w) => `${w.name} ${w.family}`.toLowerCase().includes(q))
      : MOCK_WORKFLOWS;
    if (q)
      return [
        {
          id: "results",
          label: `${list.length} result${list.length === 1 ? "" : "s"}`,
          items: list,
        },
      ];
    return GROUPS.map((g) => ({ ...g, items: list.filter(g.match) })).filter((g) => g.items.length);
  }, [query]);

  return (
    <Popover
      placement="bottom-start"
      className="w-[440px] p-0"
      trigger={
        <button
          type="button"
          className="group flex h-9 max-w-[280px] items-center gap-2.5 rounded-lg border border-line bg-field pr-2.5 pl-1 transition-colors hover:border-line-strong data-[open]:border-accent/60 focus-ring"
        >
          <Art seed={current.id} className="h-7 w-7 shrink-0 rounded-md" />
          <span className="flex min-w-0 flex-col text-left leading-tight">
            <span className="truncate text-sm font-medium text-fg">{current.name}</span>
            <span className="truncate text-2xs text-fg-3">{current.family} workflow</span>
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
        <div
          className="relative flex max-h-[min(72vh,620px)] flex-col"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f)
              toast(`"${f.name}" will be analyzed and set up as a workflow (Phase 1).`, "info");
          }}
        >
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
            <IconButton icon="import" label="Import ComfyUI workflow" variant="secondary" />
          </div>

          <div className="scroll-quiet min-h-0 flex-1 overflow-auto p-1.5">
            {groups.map((g) => (
              <div key={g.id} className="mb-1">
                <div className="label-caps px-2.5 pt-2 pb-1.5 text-[10px]">{g.label}</div>
                {g.items.map((w) => {
                  const active = w.id === current.id;
                  return (
                    <button
                      key={`${g.id}-${w.id}`}
                      type="button"
                      onClick={() => {
                        setCurrent(w.id);
                        close();
                      }}
                      className={cn(
                        "group/row flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors focus-ring",
                        active ? "bg-accent/12" : "hover:bg-field",
                      )}
                    >
                      <Art seed={w.id} className="h-9 w-9 shrink-0 rounded-md" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span
                          className={cn(
                            "truncate text-sm",
                            active ? "font-medium text-fg" : "text-fg-2 group-hover/row:text-fg",
                          )}
                        >
                          {w.name}
                        </span>
                        <span className="flex items-center gap-1.5 text-2xs text-fg-3">
                          {w.family}
                          <span className="text-fg-4">·</span>
                          edited {w.updated}
                        </span>
                      </span>
                      {w.preset ? <Badge>preset</Badge> : null}
                      {w.kind === "batch" ? <Badge tone="accent">batch</Badge> : null}
                      <Icon
                        name="star"
                        size={14}
                        className={cn(
                          w.favorite
                            ? "fill-current text-yellow-ink"
                            : "text-fg-4 opacity-0 group-hover/row:opacity-100",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1 border-t border-line p-1.5">
            <FooterAction
              icon="duplicate"
              label="Duplicate"
              onClick={() => toast(`Duplicated "${current.name}"`, "success")}
            />
            <FooterAction
              icon="workflow"
              label="Edit in ComfyUI"
              onClick={() =>
                void openWindow(
                  `http://127.0.0.1:${PORTS.comfy}/?blombo=preview`,
                  `ComfyUI: ${current.name}`,
                )
              }
            />
            <FooterAction
              icon="export"
              label="Export .blombo"
              onClick={() => toast("Exported workflow + layout", "success")}
            />
          </div>

          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-2xs text-fg-3">
            <span className="flex items-center gap-1.5">
              <Icon name="import" size={12} /> Drop a ComfyUI .json or image here to import
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
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
}: {
  icon: "duplicate" | "workflow" | "export";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium text-fg-2 hover:bg-field hover:text-fg focus-ring"
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}
