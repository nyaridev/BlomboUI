/**
 * The wildcard file tree as visible rows: folders first, then files, by name. Collapsed
 * folders hide their children; a search shows every match with its folders open.
 */
import type { WildcardEntry } from "@shared/wildcards";

export interface TreeNode {
  path: string;
  name: string;
  type: "file" | "folder";
  entry: WildcardEntry | null;
  children: TreeNode[];
}

export interface VisibleRow {
  node: TreeNode;
  depth: number;
}

export function buildTree(entries: WildcardEntry[]): TreeNode {
  const root: TreeNode = { path: "", name: "", type: "folder", entry: null, children: [] };
  const folders = new Map<string, TreeNode>([["", root]]);
  const folderFor = (path: string): TreeNode => {
    const found = folders.get(path);
    if (found) return found;
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const node: TreeNode = {
      path,
      name: path.split("/").pop() ?? path,
      type: "folder",
      entry: null,
      children: [],
    };
    folders.set(path, node);
    folderFor(parentPath).children.push(node);
    return node;
  };
  for (const e of entries) {
    if (e.type === "folder") {
      folderFor(e.path).entry = e;
      continue;
    }
    const parentPath = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
    folderFor(parentPath).children.push({
      path: e.path,
      name: e.path.split("/").pop() ?? e.path,
      type: "file",
      entry: e,
      children: [],
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort(
      (a, b) =>
        (a.type === b.type ? 0 : a.type === "folder" ? -1 : 1) ||
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    );
    for (const c of n.children) sort(c);
  };
  sort(root);
  return root;
}

export function visibleRows(
  root: TreeNode,
  expanded: ReadonlySet<string>,
  query: string,
): VisibleRow[] {
  const q = query.trim().toLowerCase();
  const out: VisibleRow[] = [];
  const matches = (n: TreeNode): boolean =>
    n.type === "file" ? n.path.toLowerCase().includes(q) : n.children.some(matches);
  const walk = (n: TreeNode, depth: number) => {
    for (const c of n.children) {
      if (q && !matches(c)) continue;
      out.push({ node: c, depth });
      if (c.type === "folder" && (q || expanded.has(c.path))) walk(c, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

/** The folder a new file goes in when `path` is selected. */
export function folderOf(path: string | null, type: "file" | "folder" | null): string {
  if (!path) return "";
  if (type === "folder") return path;
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}
