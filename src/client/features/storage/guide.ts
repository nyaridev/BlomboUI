/**
 * The Saved data view's plain-language catalogue: what each file in a profile folder and each
 * database table is for, grouped the way a person thinks about them, plus the pure helpers that
 * sort the server's raw lists into those groups. Anything the catalogue doesn't know lands in
 * "Other", so nothing on disk is hidden.
 */
import type { IconName } from "@client/icons/Icon";
import type { DevFile, DevTable } from "@shared/dev";

export interface FileGroup {
  id: string;
  title: string;
  icon: IconName;
  text: string;
}

export const FILE_GROUPS: FileGroup[] = [
  {
    id: "profile",
    title: "Profile",
    icon: "user",
    text: "Who the profile is and how it's set up. The API key never leaves this PC.",
  },
  {
    id: "workflows",
    title: "Workflows",
    icon: "workflow",
    text: "One folder per workflow: its settings and values (workflow.json), the ComfyUI canvas (graph.json) and what's sent to ComfyUI (prompt.json).",
  },
  {
    id: "layouts",
    title: "Generate layouts",
    icon: "layout-grid",
    text: "Your own arrangements of the Generate screen.",
  },
  {
    id: "database",
    title: "Database",
    icon: "data",
    text: "The gallery index, your marks and the history (its tables are below). The -wal and -shm files belong to it.",
  },
  {
    id: "inputs",
    title: "Images for stages",
    icon: "image",
    text: "Pictures you gave ControlNet and other stages, uploaded to ComfyUI with each run.",
  },
  {
    id: "trash",
    title: "Trash",
    icon: "trash",
    text: "What you removed from the gallery, kept until you empty it.",
  },
  {
    id: "other",
    title: "Other",
    icon: "folder",
    text: "Files the app doesn't describe (older layouts, files added by hand).",
  },
];

/** Friendly names for the files a profile has at its top level. */
const PROFILE_FILES: Record<string, string> = {
  "profile.json": "Name, theme, accent and folders",
  "settings.json": "Every setting",
  "secrets.json": "Civitai API key",
  "snippets.json": "Prompt snippets",
};

export interface FileEntry {
  /** What it is, in words. */
  label: string;
  /** The path inside the profile folder. */
  path: string;
  size: number;
  /** Files inside, for a folder shown as one row. */
  files: number | null;
  /** Its contents are never shown or sent (secrets.json). */
  secret: boolean;
}

export interface SortedFiles {
  group: FileGroup;
  entries: FileEntry[];
  size: number;
}

const top = (path: string) => path.split("/")[0] ?? path;

/** The profile folder's files sorted into FILE_GROUPS (empty groups left out). */
export function sortFiles(files: DevFile[]): SortedFiles[] {
  const byGroup = new Map<string, FileEntry[]>();
  const add = (group: string, entry: FileEntry) =>
    byGroup.set(group, [...(byGroup.get(group) ?? []), entry]);
  const inside = (folder: string) => files.filter((f) => !f.dir && f.path.startsWith(`${folder}/`));

  for (const f of files) {
    const name = f.path.split("/").pop() ?? f.path;
    const depth = f.path.split("/").length;
    if (f.path === "trash") {
      add("trash", {
        label: "Removed images",
        path: f.path,
        size: f.size,
        files: f.files,
        secret: false,
      });
    } else if (f.dir && depth === 2 && top(f.path) === "workflows") {
      const own = inside(f.path);
      add("workflows", {
        label: name,
        path: f.path,
        size: own.reduce((n, x) => n + x.size, 0),
        files: own.length,
        secret: false,
      });
    } else if (f.dir) {
    } else if (depth === 1 && PROFILE_FILES[name]) {
      add("profile", {
        label: PROFILE_FILES[name],
        path: f.path,
        size: f.size,
        files: null,
        secret: name === "secrets.json",
      });
    } else if (depth === 1 && /^avatar\./i.test(name)) {
      add("profile", {
        label: "Profile picture",
        path: f.path,
        size: f.size,
        files: null,
        secret: false,
      });
    } else if (depth === 1 && /^blombo\.sqlite/.test(name)) {
      const label =
        name === "blombo.sqlite"
          ? "The database"
          : name.endsWith("-wal")
            ? "Recent changes, merged in later"
            : "Working memory while it's open";
      add("database", { label, path: f.path, size: f.size, files: null, secret: false });
    } else if (top(f.path) === "workflows") {
      // Files inside a workflow folder are counted on its row.
    } else if (top(f.path) === "layouts") {
      add("layouts", {
        label: name.replace(/\.json$/i, ""),
        path: f.path,
        size: f.size,
        files: null,
        secret: false,
      });
    } else if (top(f.path) === "inputs") {
      add("inputs", { label: name, path: f.path, size: f.size, files: null, secret: false });
    } else {
      add("other", { label: name, path: f.path, size: f.size, files: null, secret: false });
    }
  }
  return FILE_GROUPS.flatMap((group) => {
    const entries = byGroup.get(group.id) ?? [];
    return entries.length
      ? [{ group, entries, size: entries.reduce((n, e) => n + e.size, 0) }]
      : [];
  });
}

export interface TableGroup {
  id: string;
  title: string;
  icon: IconName;
  text: string;
}

export const TABLE_GROUPS: TableGroup[] = [
  {
    id: "index",
    title: "Gallery index",
    icon: "gallery",
    text: "What the gallery read from your image files. If it's lost, a rescan builds it again.",
  },
  {
    id: "marks",
    title: "Your marks",
    icon: "heart",
    text: "Favorites, ratings, tags, albums and the trash list. These exist only here: keep them.",
  },
  {
    id: "history",
    title: "History",
    icon: "history",
    text: "Every run, error and download, and the tags you use most.",
  },
  {
    id: "civitai",
    title: "Civitai and model hashes",
    icon: "globe",
    text: "Model hashes and what Civitai said about them, plus what you browsed.",
  },
  { id: "other", title: "Other", icon: "data", text: "Tables this page doesn't describe yet." },
];

/** Each table's group, name in words and what it holds. */
export const TABLES: Record<string, { group: string; label: string; text: string }> = {
  images: {
    group: "index",
    label: "Images",
    text: "One row per file: size, settings summary, model, prompt.",
  },
  images_fts: {
    group: "index",
    label: "Search",
    text: "The text the gallery's search looks through.",
  },
  image_loras: {
    group: "index",
    label: "LoRAs per image",
    text: "Which LoRAs each image used, for the LoRA filter.",
  },
  image_versions: {
    group: "index",
    label: "Civitai versions per image",
    text: "The model versions behind each Civitai image.",
  },
  interrupted: {
    group: "index",
    label: "Stopped runs",
    text: "Images from stopped runs that couldn't be moved to interrupted/.",
  },
  marks: {
    group: "marks",
    label: "Favorites and ratings",
    text: "Per image, by its folder and path.",
  },
  image_tags: { group: "marks", label: "Your tags", text: "Tags you added to images." },
  collections: { group: "marks", label: "Albums", text: "The albums you made." },
  collection_items: {
    group: "marks",
    label: "Images in albums",
    text: "Which image is in which album.",
  },
  model_marks: { group: "marks", label: "Favorite models", text: "Models you starred." },
  trash: {
    group: "marks",
    label: "Trash list",
    text: "Where each removed image came from, so it can be restored.",
  },
  job_log: {
    group: "history",
    label: "Runs",
    text: "Every run: values, stages, timings, the prompts as they ran.",
  },
  job_log_uses: {
    group: "history",
    label: "What runs used",
    text: "Models, LoRAs and wildcards per run, for stats.",
  },
  error_log: {
    group: "history",
    label: "Errors",
    text: "What went wrong and when (the Errors view).",
  },
  downloads: { group: "history", label: "Downloads", text: "Every download and where it went." },
  tag_usage: {
    group: "history",
    label: "Frequent tags",
    text: "How often you used each prompt tag.",
  },
  model_hashes: {
    group: "civitai",
    label: "Model hashes",
    text: "SHA256 of model files, by path, size and time.",
  },
  civitai_lookups: {
    group: "civitai",
    label: "Civitai answers",
    text: "What Civitai knows about each hash.",
  },
  civitai_views: {
    group: "civitai",
    label: "Viewed models",
    text: "Model pages you opened (History → Civitai).",
  },
  civitai_searches: {
    group: "civitai",
    label: "Searches",
    text: "What you searched for on Civitai.",
  },
};

export function sortTables(tables: DevTable[]): Array<{ group: TableGroup; tables: DevTable[] }> {
  return TABLE_GROUPS.flatMap((group) => {
    // In the catalogue's order (the main table first), unknown ones by name after.
    const order = Object.keys(TABLES);
    const at = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);
    const own = tables
      .filter((t) => (TABLES[t.name]?.group ?? "other") === group.id)
      .sort((a, b) => at(a.name) - at(b.name) || a.name.localeCompare(b.name));
    return own.length ? [{ group, tables: own }] : [];
  });
}

/** A database column type in words. */
export function columnType(type: string): string {
  const t = type.toUpperCase();
  if (t.includes("INT")) return "whole number";
  if (t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) return "number";
  if (t.includes("TEXT") || t.includes("CHAR")) return "text";
  if (t.includes("BLOB")) return "data";
  return "anything";
}
