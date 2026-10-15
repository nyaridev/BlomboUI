/**
 * The wildcard file tree: search, new file and folder, drag a file or folder onto a folder to
 * move it, and per-row rename, reveal and move-to-trash. Virtualized for big wildcard packs.
 */
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useWildcardsChanged } from "@client/lib/queries";
import { Button, Dialog, Field, IconButton, Menu, TextField, TreeRow, toast } from "@client/ui";
import type { WildcardTree } from "@shared/wildcards";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type DragEvent, useMemo, useRef, useState } from "react";
import { useWildcardUi } from "./state";
import { buildTree, folderOf, type TreeNode, visibleRows } from "./tree";

type Ask =
  | { kind: "new-file" | "new-folder"; folder: string }
  | { kind: "rename"; node: TreeNode }
  | null;

export function TreePanel({ tree }: { tree: WildcardTree }) {
  const ui = useWildcardUi();
  const changed = useWildcardsChanged();
  const [query, setQuery] = useState("");
  const [ask, setAsk] = useState<Ask>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const root = useMemo(() => buildTree(tree.entries), [tree.entries]);
  const rows = useMemo(() => visibleRows(root, ui.expanded, query), [root, ui.expanded, query]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 12,
  });
  const selectedType = ui.open ? "file" : null;

  const move = async (from: string, folder: string) => {
    const name = from.split("/").pop() ?? from;
    const to = folder ? `${folder}/${name}` : name;
    if (to === from || to.startsWith(`${from}/`)) return;
    try {
      await api.moveWildcard(from, to);
      ui.moved(from, to);
      changed();
      toast(`Moved "${name}" to ${folder || "the top level"}`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const onDrop = (folder: string) => (e: DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const from = e.dataTransfer.getData("text/x-wildcard");
    if (from) void move(from, folder);
  };
  const allowDrop = (folder: string) => (e: DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("text/x-wildcard")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(folder);
  };

  const trash = async (node: TreeNode) => {
    try {
      await api.trashWildcard(node.path);
      if (ui.open && (ui.open === node.path || ui.open.startsWith(`${node.path}/`)))
        ui.setOpen(null);
      ui.dropDraft(node.path);
      changed();
      toast(`Moved "${node.name}" to the profile's trash`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-1 border-b border-line p-2">
        <TextField
          size="sm"
          icon="search"
          placeholder="Find a file"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          className="flex-1"
          aria-label="Find a wildcard file"
        />
        <IconButton
          icon="file-plus"
          label="New file"
          size="sm"
          onClick={() => setAsk({ kind: "new-file", folder: folderOf(ui.open, selectedType) })}
        />
        <IconButton
          icon="folder-plus"
          label="New folder"
          size="sm"
          onClick={() => setAsk({ kind: "new-folder", folder: folderOf(ui.open, selectedType) })}
        />
      </div>
      <div
        ref={scrollRef}
        className={cn(
          "scroll-quiet min-h-0 flex-1 overflow-y-auto p-1.5",
          dropTarget === "" && "bg-accent/6",
        )}
        onDragOver={allowDrop("")}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
        }}
        onDrop={onDrop("")}
      >
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-fg-3">
            {query
              ? "No file matches."
              : "No .txt or .yaml files yet. Create one with the buttons above."}
          </p>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((v) => {
              const row = rows[v.index];
              if (!row) return null;
              const { node, depth } = row;
              const folder = node.type === "folder";
              return (
                <div
                  key={node.path}
                  className="absolute inset-x-0 top-0"
                  style={{ transform: `translateY(${v.start}px)` }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/x-wildcard", node.path);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={
                    folder
                      ? (e) => {
                          e.stopPropagation();
                          allowDrop(node.path)(e);
                        }
                      : undefined
                  }
                  onDrop={
                    folder
                      ? (e) => {
                          e.stopPropagation();
                          onDrop(node.path)(e);
                        }
                      : undefined
                  }
                >
                  <TreeRow
                    depth={depth}
                    label={node.name}
                    icon={
                      folder ? "folder" : node.entry?.format === "yaml" ? "raw-mode" : "file-text"
                    }
                    open={folder ? Boolean(query) || ui.expanded.has(node.path) : undefined}
                    selected={ui.open === node.path}
                    dirty={!folder && Boolean(ui.drafts[node.path])}
                    className={cn(dropTarget === node.path && "bg-accent/15 ring-1 ring-accent/50")}
                    onClick={() => (folder ? ui.toggle(node.path) : ui.setOpen(node.path))}
                    actions={
                      <Menu
                        width={200}
                        trigger={
                          <IconButton
                            icon="more-horizontal"
                            label={`${node.name} options`}
                            size="xs"
                          />
                        }
                        items={[
                          ...(folder
                            ? [
                                {
                                  id: "new",
                                  label: "New file here",
                                  icon: "file-plus" as const,
                                  onSelect: () => setAsk({ kind: "new-file", folder: node.path }),
                                },
                              ]
                            : []),
                          {
                            id: "rename",
                            label: "Rename",
                            icon: "edit",
                            onSelect: () => setAsk({ kind: "rename", node }),
                          },
                          {
                            id: "reveal",
                            label: "Show in Explorer",
                            icon: "folder-open",
                            onSelect: () =>
                              void api
                                .revealWildcard(node.path)
                                .catch((e: Error) => toast(e.message, "error")),
                          },
                          { type: "separator", id: "sep" },
                          {
                            id: "trash",
                            label: "Move to trash",
                            icon: "trash",
                            tone: "danger",
                            onSelect: () => void trash(node),
                          },
                        ]}
                      />
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div
        className="truncate border-t border-line px-3 py-2 font-mono text-2xs text-fg-4"
        title={tree.root}
      >
        {tree.root}
      </div>
      <AskDialog ask={ask} onClose={() => setAsk(null)} />
    </aside>
  );
}

function AskDialog({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  const ui = useWildcardUi();
  const changed = useWildcardsChanged();
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const initial =
    ask?.kind === "rename"
      ? ask.node.name
      : ask?.kind === "new-file"
        ? "new-wildcard.txt"
        : "new folder";
  const shown = value ?? initial;
  const close = () => {
    setValue(null);
    onClose();
  };
  const submit = async () => {
    if (!ask || !shown.trim()) return;
    setBusy(true);
    try {
      if (ask.kind === "rename") {
        const parent = ask.node.path.includes("/")
          ? ask.node.path.slice(0, ask.node.path.lastIndexOf("/"))
          : "";
        const to = parent ? `${parent}/${shown.trim()}` : shown.trim();
        await api.moveWildcard(ask.node.path, to);
        ui.moved(ask.node.path, to);
        toast(`Renamed to "${shown.trim()}"`, "success");
      } else {
        let name = shown.trim();
        if (ask.kind === "new-file" && !/\.(txt|ya?ml)$/i.test(name)) name += ".txt";
        const path = ask.folder ? `${ask.folder}/${name}` : name;
        await api.createWildcard(path, ask.kind === "new-file" ? "file" : "folder");
        if (ask.kind === "new-file") ui.setOpen(path);
        else ui.toggle(path, true);
      }
      changed();
      close();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const title =
    ask?.kind === "rename"
      ? "Rename"
      : ask?.kind === "new-file"
        ? "New wildcard file"
        : "New folder";
  return (
    <Dialog
      open={ask !== null}
      onOpenChange={(o) => !o && close()}
      title={title}
      description={
        ask?.kind === "new-file"
          ? `In ${ask.folder || "the wildcards folder"}. End the name in .txt (one option per line) or .yaml (lists under keys).`
          : ask?.kind === "new-folder"
            ? `In ${ask.folder || "the wildcards folder"}.`
            : "Prompts that use the old name need the new one."
      }
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!shown.trim()}
            onClick={() => void submit()}
          >
            {ask?.kind === "rename" ? "Rename" : "Create"}
          </Button>
        </>
      }
    >
      <Field label="Name">
        {(id) => (
          <TextField
            id={id}
            value={shown}
            mono
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
          />
        )}
      </Field>
    </Dialog>
  );
}
