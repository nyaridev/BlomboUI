/**
 * The left sidebar of the pickers and Models → Local: "All", then the folders the files sit in
 * (folders.ts). A click shows that folder (its subfolders too) and opens it; a second click on
 * the shown folder closes it; right-click offers Show in Explorer. Only folders are listed: a
 * LoRA folder can hold thousands of files, and the grid shows them. Rows are the roomy `lg`
 * TreeRows.
 */
import { TreeRow } from "@client/ui";
import { type MouseEvent, useState } from "react";
import type { FolderNode } from "./folders";

export function FolderTree({
  nodes,
  total,
  folder,
  onFolder,
  onMenu,
}: {
  nodes: FolderNode[];
  total: number;
  folder: string | null;
  onFolder: (folder: string | null) => void;
  /** Right-click on a folder (its path below the kind folder). */
  onMenu: (e: MouseEvent<HTMLElement>, path: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (path: string, on: boolean) =>
    setOpen((s) => {
      const next = new Set(s);
      if (on) next.add(path);
      else next.delete(path);
      return next;
    });

  const rows = (list: FolderNode[], depth: number) =>
    list.map((n) => {
      const isOpen = open.has(n.path);
      return (
        <div key={n.path}>
          <TreeRow
            size="lg"
            onContextMenu={(e) => onMenu(e, n.path)}
            depth={depth}
            label={n.name}
            icon={isOpen ? "folder-open" : "folder"}
            open={n.children.length ? isOpen : undefined}
            selected={folder === n.path}
            meta={<span className="tabular">{n.count}</span>}
            onClick={() => {
              onFolder(n.path);
              toggle(n.path, folder === n.path ? !isOpen : true);
            }}
          />
          {isOpen ? rows(n.children, depth + 1) : null}
        </div>
      );
    });

  return (
    <nav
      aria-label="Folders"
      className="scroll-quiet flex w-80 shrink-0 flex-col gap-0.5 overflow-y-auto rounded-lg border border-line bg-surface p-1.5 max-lg:hidden"
    >
      <TreeRow
        size="lg"
        depth={0}
        label="All"
        icon="stack"
        selected={folder === null}
        meta={<span className="tabular">{total}</span>}
        onClick={() => onFolder(null)}
      />
      {rows(nodes, 0)}
    </nav>
  );
}
