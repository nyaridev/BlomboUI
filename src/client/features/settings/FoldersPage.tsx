/**
 * Settings → Folders: ordered lists of models, output and wildcards folders (ADR-0017). The first
 * of each kind is the main one: downloads, generated images and batch results go there. The others
 * are only read (and edited in place). Rows are dragged to reorder; the top one is main. Changes
 * are a draft until Save, since a new models list restarts a managed ComfyUI.
 */

import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useDebounced } from "@client/lib/hooks";
import { useUpdateProfile } from "@client/lib/queries";
import { Button, IconButton, SectionTitle, TextField, toast } from "@client/ui";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FOLDER_KINDS,
  type FolderKind,
  folderIdFrom,
  folderNameOf,
  MAIN_FOLDER_IDS,
  type Profile,
  type ProfileFolder,
  type ProfileFolders,
} from "@shared/profile";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const KINDS: Record<
  FolderKind,
  { title: string; icon: IconName; hint: string; add: string; label: string; example: string }
> = {
  models: {
    title: "Models",
    icon: "models",
    label: "Models",
    hint: "ComfyUI and the Models page read every folder; when two hold the same file, the higher one wins. Downloads go into the top one. A managed ComfyUI restarts to see a change.",
    add: "Add a models folder",
    example: "D:\\AI\\Models",
  },
  outputs: {
    title: "Outputs",
    icon: "gallery",
    label: "Outputs",
    hint: "Generated images and batch results are saved in the top one. The gallery shows them all together, or one folder at a time from its sidebar.",
    add: "Add an output folder",
    example: "D:\\AI\\Outputs",
  },
  wildcards: {
    title: "Wildcards",
    icon: "wildcards",
    label: "Wildcards",
    hint: "__wildcards__ in prompts come from every folder; when two have the same name, the higher one wins.",
    add: "Add a wildcards folder",
    example: "D:\\AI\\Wildcards",
  },
};

/** A draft row: the folder plus a key that stays put while its path is typed or it moves. */
type Row = ProfileFolder & { key: string };
type Draft = Record<FolderKind, Row[]>;
const NO_FOLDERS: ProfileFolders = { models: [], outputs: [], wildcards: [] };

let nextKey = 0;
const keyed = (f: ProfileFolder): Row => ({ ...f, key: String(++nextKey) });
const toDraft = (folders: ProfileFolders): Draft =>
  Object.fromEntries(FOLDER_KINDS.map((k) => [k, folders[k].map(keyed)])) as Draft;

/**
 * What Save sends: rows with a path, trimmed, without their keys. Blank new rows are dropped.
 * Saved folders keep their id (gallery marks and wildcard paths point at it); a new one gets the
 * main id when it's on top and that id is free, otherwise one made from its name.
 */
function toFolders(draft: Draft): ProfileFolders {
  const out: ProfileFolders = { models: [], outputs: [], wildcards: [] };
  for (const kind of FOLDER_KINDS) {
    const rows = draft[kind].filter((f) => f.path.trim());
    const taken = rows.map((f) => f.id).filter(Boolean);
    out[kind] = rows.map((f, i) => {
      let id = f.id;
      if (!id) {
        id =
          i === 0 && !taken.includes(MAIN_FOLDER_IDS[kind])
            ? MAIN_FOLDER_IDS[kind]
            : folderIdFrom(f.name.trim(), taken);
        taken.push(id);
      }
      return { id, name: f.name.trim(), path: f.path.trim() };
    });
  }
  return out;
}

const samePath = (a: string, b: string) =>
  a
    .trim()
    .replace(/[\\/]+$/, "")
    .toLowerCase() ===
  b
    .trim()
    .replace(/[\\/]+$/, "")
    .toLowerCase();

/** What's wrong with a row, or null. A row without a path is skipped, so it has no problem. */
function problem(list: Row[], i: number): string | null {
  const f = list[i];
  if (!f?.path.trim()) return null;
  if (list.findIndex((o) => samePath(o.path, f.path)) !== i)
    return "This folder is already in the list.";
  if (!f.name.trim()) return "Give it a name.";
  return null;
}

export function FoldersPage({ profile }: { profile: Profile | undefined }) {
  const update = useUpdateProfile();
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile?.folders ?? NO_FOLDERS));
  useEffect(() => {
    if (profile) setDraft(toDraft(profile.folders));
  }, [profile]);
  const folders = toFolders(draft);
  const dirty =
    profile !== undefined && JSON.stringify(folders) !== JSON.stringify(profile.folders);
  const invalid = FOLDER_KINDS.some((k) => draft[k].some((_, i) => problem(draft[k], i)));

  const save = () => {
    if (!profile) return;
    update.mutate(
      { id: profile.id, body: { folders } },
      {
        onSuccess: () => toast("Folders saved", "success"),
        onError: (e) => toast(e.message, "error"),
      },
    );
  };

  return (
    <div className="flex flex-col gap-10">
      {FOLDER_KINDS.map((kind) => (
        <FolderList
          key={kind}
          kind={kind}
          list={draft[kind]}
          onChange={(list) => setDraft((d) => ({ ...d, [kind]: list }))}
        />
      ))}
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={!dirty || invalid}
          loading={update.isPending}
          onClick={save}
        >
          Save folders
        </Button>
        {dirty ? (
          <Button variant="ghost" onClick={() => profile && setDraft(toDraft(profile.folders))}>
            Undo changes
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FolderList({
  kind,
  list,
  onChange,
}: {
  kind: FolderKind;
  list: Row[];
  onChange: (list: Row[]) => void;
}) {
  const info = KINDS[kind];
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const add = () => {
    const row = keyed({ id: "", name: "", path: "" });
    setFocusKey(row.key);
    onChange([...list, row]);
  };
  const setPath = (i: number, path: string) =>
    onChange(
      list.map((f, j) => {
        if (j !== i) return f;
        // The name follows the path until you change it yourself.
        const autoName = f.name === "" || f.name === folderNameOf(f.path, info.label);
        const name = autoName ? (path.trim() ? folderNameOf(path, info.label) : "") : f.name;
        return { ...f, path, name };
      }),
    );
  const onDragEnd = (e: DragEndEvent) => {
    const from = list.findIndex((f) => f.key === e.active.id);
    const to = list.findIndex((f) => f.key === e.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...list];
    const [f] = next.splice(from, 1);
    if (f) next.splice(to, 0, f);
    onChange(next);
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle icon={info.icon}>{info.title}</SectionTitle>
      <p className="max-w-[72ch] text-xs text-fg-3 text-pretty">{info.hint}</p>
      <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={list.map((f) => f.key)} strategy={verticalListSortingStrategy}>
            {list.map((f, i) => (
              <FolderRow
                key={f.key}
                kind={kind}
                folder={f}
                autoFocus={f.key === focusKey}
                error={problem(list, i)}
                onPath={(p) => setPath(i, p)}
                onName={(name) => onChange(list.map((o, j) => (j === i ? { ...o, name } : o)))}
                onRemove={() => onChange(list.filter((_, j) => j !== i))}
              />
            ))}
          </SortableContext>
        </DndContext>
        <li>
          <button
            type="button"
            onClick={add}
            aria-label={info.add}
            title={info.add}
            className={cn(
              "group flex w-full justify-center rounded-b-lg py-2 text-fg-3 transition-colors hover:bg-field hover:text-fg focus-ring",
              list.length === 0 && "rounded-t-lg",
            )}
          >
            <span className="grid h-6 w-6 place-items-center rounded-md border border-dashed border-line-strong group-hover:border-fg-4">
              <Icon name="plus" size={14} />
            </span>
          </button>
        </li>
      </ol>
    </section>
  );
}

function FolderRow({
  kind,
  folder,
  autoFocus,
  error,
  onPath,
  onName,
  onRemove,
}: {
  kind: FolderKind;
  folder: Row;
  autoFocus: boolean;
  error: string | null;
  onPath: (path: string) => void;
  onName: (name: string) => void;
  onRemove: () => void;
}) {
  const info = KINDS[kind];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: folder.key,
  });
  const path = useDebounced(folder.path.trim(), 250);
  const check = useQuery({
    queryKey: ["check-path", path],
    queryFn: () => api.checkPath(path),
    enabled: path.length > 0,
    staleTime: 5_000,
  });
  // Only judge the path once the check matches what's typed.
  const checked = path === folder.path.trim() && check.data ? check.data : null;
  const found = Boolean(checked?.exists && checked.isDirectory);
  const missing = checked !== null && !found;
  const [picking, setPicking] = useState(false);
  const browse = async () => {
    setPicking(true);
    try {
      const res = await api.pickFolder(
        `Choose a ${info.label.toLowerCase()} folder`,
        folder.path || undefined,
      );
      if (res.path) onPath(res.path);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't open the folder picker.", "error");
    } finally {
      setPicking(false);
    }
  };

  return (
    <li
      ref={setNodeRef}
      // Rows only slide up and down.
      style={{ transform: CSS.Translate.toString(transform && { ...transform, x: 0 }), transition }}
      className={cn(
        "relative flex flex-col gap-1 bg-surface px-2 py-1.5 first:rounded-t-lg",
        isDragging && "z-10 rounded-lg shadow-pop",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label={`Drag ${folder.name || "folder"} to reorder`}
          className="grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded-xs text-fg-4 hover:text-fg-2 focus-ring active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <Icon name="grip" size={14} />
        </button>
        <TextField
          size="sm"
          value={folder.name}
          placeholder="Name"
          maxLength={60}
          onChange={(e) => onName(e.target.value)}
          aria-label="Folder name"
          className="w-44 shrink-0 font-medium max-lg:w-28"
        />
        <TextField
          size="sm"
          mono
          value={folder.path}
          placeholder={info.example}
          autoFocus={autoFocus}
          onChange={(e) => onPath(e.target.value)}
          valid={found}
          invalid={missing}
          aria-label={`${info.label} folder path`}
          className="min-w-0 flex-1"
          trailing={
            <IconButton
              size="xs"
              icon="folder-open"
              label="Browse"
              disabled={picking}
              onClick={() => void browse()}
            />
          }
        />
        <IconButton
          size="sm"
          icon="x"
          label="Remove from the list (files stay)"
          onClick={onRemove}
        />
      </div>
      {missing || error ? (
        <div className="flex flex-col gap-0.5 pb-0.5 pl-7 text-xs text-danger">
          {missing ? (
            <span className="flex items-center gap-1.5">
              <Icon name="x-circle" size={13} />
              {checked?.exists ? "That's a file, not a folder." : "This folder doesn't exist."}
            </span>
          ) : null}
          {error ? <span>{error}</span> : null}
        </div>
      ) : null}
    </li>
  );
}
