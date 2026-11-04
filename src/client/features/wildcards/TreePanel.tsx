/**
 * The wildcard file tree: search, new file and folder, drag a file or folder onto a folder to
 * move it, and per-row rename, reveal and move-to-trash. Virtualized for big wildcard packs.
 * Each of the profile's wildcard folders is a top-level row (its id is the first path segment);
 * files move only within one of them, and a file a higher folder overrides is marked.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useWildcardsChanged } from "@client/lib/queries";
import {
  Badge,
  Button,
  Dialog,
  Field,
  IconButton,
  Menu,
  type MenuEntry,
  openContextMenu,
  Segmented,
  TextField,
  TreeRow,
  toast,
} from "@client/ui";
import { type WildcardFormat, type WildcardTree, wildcardFormat } from "@shared/wildcards";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useWildcardUi } from "./state";
import { buildTree, folderOf, type TreeNode, visibleRows } from "./tree";

type Ask =
  | { kind: "new-file" | "new-folder"; folder: string }
  | { kind: "rename"; node: TreeNode }
  | null;

export function TreePanel({ tree, className }: { tree: WildcardTree; className?: string }) {
  const ui = useWildcardUi();
  const changed = useWildcardsChanged();
  const [query, setQuery] = useState("");
  const [ask, setAsk] = useState<Ask>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const roots = useMemo(() => new Map(tree.folders.map((f, i) => [f.id, i])), [tree.folders]);
  const root = useMemo(() => {
    const r = buildTree(tree.entries);
    // Wildcard folders keep their order from Settings → Folders (main first).
    r.children.sort((a, b) => (roots.get(a.path) ?? 0) - (roots.get(b.path) ?? 0));
    return r;
  }, [tree.entries, roots]);
  const rows = useMemo(() => visibleRows(root, ui.expanded, query), [root, ui.expanded, query]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    // Folder rows are Gallery-library sized (the ones after the first with a gap above).
    estimateSize: (i) => (rows[i]?.depth === 0 ? (i === 0 ? 48 : 56) : 36),
    overscan: 12,
  });
  // How many files each folder holds, subfolders included.
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const e of tree.entries) {
      if (e.type !== "file") continue;
      const parts = e.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const p = parts.slice(0, i).join("/");
        out.set(p, (out.get(p) ?? 0) + 1);
      }
    }
    return out;
  }, [tree.entries]);
  const selectedType = ui.open ? "file" : null;
  const hidden = useMemo(() => new Set(tree.hidden), [tree.hidden]);
  const mainId = tree.folders[0]?.id ?? "";
  // Where new files go: the selected file's folder, else the main folder.
  const target = folderOf(ui.open, selectedType) || mainId;
  const shownFolder = tree.folders.find((f) => f.id === target.split("/")[0]) ?? tree.folders[0];
  const where = (p: string) => {
    const [id = "", ...rest] = p.split("/");
    return [tree.folders.find((f) => f.id === id)?.name ?? id, ...rest].join("/");
  };

  // Wildcard folders start open, once each.
  const seen = useRef(new Set<string>());
  const toggle = ui.toggle;
  useEffect(() => {
    for (const f of tree.folders)
      if (!seen.current.has(f.id)) {
        seen.current.add(f.id);
        toggle(f.id, true);
      }
  }, [tree.folders, toggle]);

  const move = async (from: string, folder: string) => {
    const name = from.split("/").pop() ?? from;
    const to = `${folder}/${name}`;
    if (!folder || roots.has(from) || to === from || to.startsWith(`${from}/`)) return;
    try {
      await api.moveWildcard(from, to);
      ui.moved(from, to);
      changed();
      toast(`Moved "${name}" to ${folder}`, "success");
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

  const rowMenu = (node: TreeNode, isRoot: boolean): MenuEntry[] => [
    ...(node.type === "folder"
      ? [
          {
            id: "new",
            label: "New file here",
            icon: "file-plus" as const,
            onSelect: () => setAsk({ kind: "new-file", folder: node.path }),
          },
          {
            id: "new-folder",
            label: "New folder here",
            icon: "folder-plus" as const,
            onSelect: () => setAsk({ kind: "new-folder", folder: node.path }),
          },
        ]
      : []),
    ...(isRoot
      ? []
      : [
          {
            id: "rename",
            label: "Rename",
            icon: "edit" as const,
            onSelect: () => setAsk({ kind: "rename", node }),
          },
        ]),
    {
      id: "reveal",
      label: "Show in Explorer",
      icon: "folder-open",
      onSelect: () =>
        void api.revealWildcard(node.path).catch((e: Error) => toast(e.message, "error")),
    },
    ...(isRoot
      ? []
      : [
          { type: "separator" as const, id: "sep" },
          {
            id: "trash",
            label: "Move to trash",
            icon: "trash" as const,
            tone: "danger" as const,
            onSelect: () => void trash(node),
          },
        ]),
  ];

  return (
    <aside
      className={cn(
        "flex w-[280px] shrink-0 flex-col border-r border-line bg-surface max-lg:w-full max-lg:border-r-0",
        className,
      )}
    >
      <div className="flex flex-col px-3 pt-3">
        <TextField
          size="sm"
          icon="search"
          placeholder="Find a file"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          aria-label="Find a wildcard file"
        />
        <div className="label-caps mt-4 mb-1 flex items-center justify-between px-2 text-[10px]">
          Files
          <span className="flex">
            <IconButton
              icon="file-plus"
              label="New file"
              size="xs"
              disabled={!mainId}
              onClick={() => setAsk({ kind: "new-file", folder: target })}
            />
            <IconButton
              icon="folder-plus"
              label="New folder"
              size="xs"
              disabled={!mainId}
              onClick={() => setAsk({ kind: "new-folder", folder: target })}
            />
          </span>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-3 pb-3"
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
        }}
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
              const rootIndex = depth === 0 ? roots.get(node.path) : undefined;
              const isRoot = rootIndex !== undefined;
              const isHidden = hidden.has(node.path);
              const open = folder && (Boolean(query) || ui.expanded.has(node.path));
              // The ⋯ button and a right-click on the row show the same menu.
              const items = rowMenu(node, isRoot);
              const menu = (
                <Menu
                  width={200}
                  trigger={
                    <IconButton icon="more-horizontal" label={`${node.name} options`} size="xs" />
                  }
                  items={items}
                />
              );
              const drop = dropTarget === node.path ? "bg-accent/15 ring-1 ring-accent/50" : null;
              return (
                <div
                  key={node.path}
                  className={cn("absolute inset-x-0 top-0", isRoot && v.index > 0 && "pt-2")}
                  onContextMenu={(e) => openContextMenu(e, items)}
                  style={{ transform: `translateY(${v.start}px)` }}
                  draggable={!isRoot}
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
                  {isRoot ? (
                    <RootRow
                      name={tree.folders[rootIndex]?.name ?? node.name}
                      files={counts.get(node.path) ?? 0}
                      main={rootIndex === 0 && tree.folders.length > 1}
                      missing={tree.folders[rootIndex]?.exists === false}
                      open={open}
                      onToggle={() => ui.toggle(node.path)}
                      className={drop ?? undefined}
                      menu={menu}
                    />
                  ) : (
                    <TreeRow
                      size="lg"
                      depth={depth - 1}
                      label={folder ? node.name : stem(node.name)}
                      meta={
                        isHidden ? (
                          <span title="A file with the same name in a higher folder is used instead.">
                            overridden
                          </span>
                        ) : folder ? (
                          <span className="tabular">{counts.get(node.path) ?? 0}</span>
                        ) : (
                          extension(node.name)
                        )
                      }
                      icon={
                        folder
                          ? open
                            ? "folder-open"
                            : "folder"
                          : node.entry?.format === "yaml"
                            ? "raw-mode"
                            : "file-text"
                      }
                      open={folder ? open : undefined}
                      selected={ui.open === node.path}
                      dirty={!folder && Boolean(ui.drafts[node.path])}
                      className={cn(drop, isHidden && "text-fg-4")}
                      onClick={() => (folder ? ui.toggle(node.path) : ui.setOpen(node.path))}
                      actions={menu}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div
        className="truncate border-t border-line px-3 py-2 font-mono text-2xs text-fg-4"
        title={shownFolder?.path}
      >
        {shownFolder?.path}
      </div>
      <AskDialog ask={ask} where={where} onClose={() => setAsk(null)} />
    </aside>
  );
}

/** A wildcards folder, as the Gallery shows a library: a tile, the name, how many files. */
function RootRow({
  name,
  files,
  main,
  missing,
  open,
  onToggle,
  menu,
  className,
}: {
  name: string;
  files: number;
  main: boolean;
  missing: boolean;
  open: boolean;
  onToggle: () => void;
  menu: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("group relative rounded-md", className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-md p-1.5 pr-8 text-left transition-colors hover:bg-field/60 focus-ring"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sunken text-fg-3">
          <Icon
            name={missing ? "errors" : "wildcards"}
            size={16}
            className={missing ? "text-warning" : undefined}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm text-fg">{name}</span>
            {main ? <Badge tone="accent">Main</Badge> : null}
          </span>
          <span
            className={cn(
              "truncate text-2xs",
              missing ? "text-warning" : "font-mono text-fg-3 tabular",
            )}
          >
            {missing
              ? "Folder not found"
              : `${files.toLocaleString()} ${files === 1 ? "file" : "files"}`}
          </span>
        </span>
        <Icon
          name="chevron-right"
          size={14}
          className={cn(
            "shrink-0 text-fg-4 transition-[rotate,opacity] group-hover:opacity-0 group-focus-within:opacity-0 pointer-coarse:hidden",
            open && "rotate-90",
          )}
        />
      </button>
      <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100 focus-within:opacity-100">
        {menu}
      </div>
    </div>
  );
}

const stem = (name: string) => name.replace(/\.(txt|ya?ml)$/i, "");
const extension = (name: string) => /\.(txt|ya?ml)$/i.exec(name)?.[1]?.toLowerCase() ?? "";

function AskDialog({
  ask,
  where,
  onClose,
}: {
  ask: Ask;
  /** A tree path as people read it: the wildcards folder by its name. */
  where: (path: string) => string;
  onClose: () => void;
}) {
  const ui = useWildcardUi();
  const changed = useWildcardsChanged();
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The last format picked stays picked (the dialog stays mounted).
  const [format, setFormat] = useState<WildcardFormat>("txt");
  const initial =
    ask?.kind === "rename"
      ? ask.node.name
      : ask?.kind === "new-file"
        ? "new-wildcard"
        : "new folder";
  const shown = value ?? initial;
  // A typed extension wins over the picked format.
  const typed = wildcardFormat(shown.trim());
  const shownFormat = typed ?? format;
  const pickFormat = (f: WildcardFormat) => {
    setFormat(f);
    if (typed) setValue(`${shown.trim().replace(/\.(txt|ya?ml)$/i, "")}.${f}`);
  };
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
        if (ask.kind === "new-file" && !typed) name += `.${format}`;
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
          ? `In ${where(ask.folder)}.`
          : ask?.kind === "new-folder"
            ? `In ${where(ask.folder)}.`
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
      <div className="flex flex-col gap-4">
        <Field label="Name">
          {(id) => (
            <TextField
              id={id}
              value={shown}
              mono
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              trailing={
                ask?.kind === "new-file" && !typed ? (
                  <span className="pr-1 font-mono text-xs text-fg-4">.{format}</span>
                ) : undefined
              }
            />
          )}
        </Field>
        {ask?.kind === "new-file" ? (
          <Field
            label="Format"
            hint={
              shownFormat === "yaml"
                ? "Lists under keys, edited as sections. A key inside is used as __key__, a group's as __group/key__."
                : `One option per line. Used as __${newTxtName(ask.folder, shown)}__.`
            }
          >
            <Segmented
              full
              label="Format"
              value={shownFormat}
              onChange={pickFormat}
              options={[
                { value: "txt", icon: "file-text", label: "Text (.txt)" },
                { value: "yaml", icon: "raw-mode", label: "YAML (.yaml)" },
              ]}
            />
          </Field>
        ) : null}
      </div>
    </Dialog>
  );
}

/** The reference a new .txt file gets: its path without the wildcards folder's id. */
function newTxtName(folder: string, name: string): string {
  const inside = folder.includes("/") ? `${folder.slice(folder.indexOf("/") + 1)}/` : "";
  return `${inside}${name.trim().replace(/\.txt$/i, "")}`;
}
