/**
 * The pickers' folder tree: the folders the listed files sit in, nested, each with how many
 * files it holds (its subfolders included). Names come from ComfyUI with either slash.
 */

export interface FolderNode {
  /** "styles/anime", forward slashes. */
  path: string;
  name: string;
  count: number;
  children: FolderNode[];
}

const slashes = (s: string) => s.replace(/\\/g, "/");

export function folderTree(files: string[]): FolderNode[] {
  const root: FolderNode = { path: "", name: "", count: 0, children: [] };
  const byPath = new Map<string, FolderNode>();
  for (const file of files) {
    let node = root;
    for (const part of slashes(file).split("/").slice(0, -1)) {
      const path = node.path ? `${node.path}/${part}` : part;
      let next = byPath.get(path);
      if (!next) {
        next = { path, name: part, count: 0, children: [] };
        byPath.set(path, next);
        node.children.push(next);
      }
      next.count++;
      node = next;
    }
  }
  const sort = (n: FolderNode) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

/** Inside `folder` or one of its subfolders; everything when there's no folder. */
export function inFolder(file: string, folder: string | null): boolean {
  return !folder || slashes(file).startsWith(`${folder}/`);
}
