/**
 * Settings → Folders: ordered lists of models, output and wildcards folders (ADR-0017). The first
 * of each kind is the main one: downloads, generated images and batch results go there. The others
 * are only read (and edited in place). Changes are a draft until Save, since a new models list
 * restarts a managed ComfyUI.
 */

import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useDebounced } from "@client/lib/hooks";
import { useUpdateProfile } from "@client/lib/queries";
import { Badge, Button, IconButton, InlineInput, SectionTitle, TextField, toast } from "@client/ui";
import {
  FOLDER_KINDS,
  FolderId,
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
    hint: "ComfyUI and the Models page read every folder; when two hold the same file, the higher one wins. Downloads go into the main one. A managed ComfyUI restarts to see a change.",
    add: "Add a models folder",
    example: "D:\\AI\\Models",
  },
  outputs: {
    title: "Outputs",
    icon: "gallery",
    label: "Outputs",
    hint: "Generated images and batch results are saved in the main one. The gallery shows them all together, or one folder at a time from its sidebar.",
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
/** What Save sends: rows with a path, trimmed, without their keys. Blank new rows are dropped. */
const toFolders = (draft: Draft): ProfileFolders =>
  Object.fromEntries(
    FOLDER_KINDS.map((k) => [
      k,
      draft[k]
        .filter((f) => f.path.trim())
        .map((f) => ({ id: f.id, name: f.name.trim(), path: f.path.trim() })),
    ]),
  ) as ProfileFolders;

const samePath = (a: string, b: string) =>
  a
    .trim()
    .replace(/[\\/]+$/, "")
    .toLowerCase() ===
  b
    .trim()
    .replace(/[\\/]+$/, "")
    .toLowerCase();

/** The id a row gets from its name: the main id for a first folder, so gallery marks still match. */
function autoId(kind: FolderKind, name: string, list: Row[], i: number): string {
  const others = list.filter((_, j) => j !== i).map((f) => f.id);
  if (i === 0 && !others.includes(MAIN_FOLDER_IDS[kind])) return MAIN_FOLDER_IDS[kind];
  return name ? folderIdFrom(name, others) : "";
}

/** What's wrong with a row, or null. A row without a path is skipped, so it has no problem. */
function problem(list: Row[], i: number): string | null {
  const f = list[i];
  if (!f?.path.trim()) return null;
  if (list.findIndex((o) => samePath(o.path, f.path)) !== i)
    return "This folder is already in the list.";
  if (!f.name.trim()) return "Give it a name.";
  if (!FolderId.safeParse(f.id).success)
    return "Ids use a-z, 0-9 and dashes, and start with a letter or digit.";
  if (list.findIndex((o) => o.id === f.id) !== i) return `Another folder already uses "${f.id}".`;
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

  const add = () => {
    const row = keyed({ id: "", name: "", path: "" });
    setFocusKey(row.key);
    onChange([...list, row]);
  };
  const setPath = (i: number, path: string) =>
    onChange(
      list.map((f, j) => {
        if (j !== i) return f;
        // Name and id follow the path until you change them yourself.
        const autoName = f.name === "" || f.name === folderNameOf(f.path, info.label);
        const name = autoName ? (path.trim() ? folderNameOf(path, info.label) : "") : f.name;
        const autoIdNow = f.id === "" || f.id === autoId(kind, f.name, list, i);
        return { ...f, path, name, id: autoIdNow ? autoId(kind, name, list, i) : f.id };
      }),
    );
  const move = (from: number, to: number) => {
    const next = [...list];
    const [f] = next.splice(from, 1);
    if (f) next.splice(to, 0, f);
    onChange(next);
  };
  const edit = (i: number, patch: Partial<ProfileFolder>) =>
    onChange(list.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle icon={info.icon}>{info.title}</SectionTitle>
      <p className="max-w-[72ch] text-xs text-fg-3 text-pretty">{info.hint}</p>
      <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        {list.map((f, i) => (
          <FolderRow
            key={f.key}
            kind={kind}
            folder={f}
            index={i}
            last={i === list.length - 1}
            autoFocus={f.key === focusKey}
            error={problem(list, i)}
            onPath={(p) => setPath(i, p)}
            onEdit={(patch) => edit(i, patch)}
            onMove={(to) => move(i, to)}
            onRemove={() => onChange(list.filter((_, j) => j !== i))}
          />
        ))}
        <li>
          <button
            type="button"
            onClick={add}
            className={cn(
              "flex w-full items-center gap-3 rounded-b-lg px-3 py-2.5 text-left text-sm text-fg-3 transition-colors hover:bg-field hover:text-fg focus-ring",
              list.length === 0 && "rounded-t-lg",
            )}
          >
            <span className="flex w-12 shrink-0 justify-center">
              <span className="grid h-6 w-6 place-items-center rounded-md border border-dashed border-line-strong">
                <Icon name="plus" size={14} />
              </span>
            </span>
            {info.add}
          </button>
        </li>
      </ol>
    </section>
  );
}

function FolderRow({
  kind,
  folder,
  index,
  last,
  autoFocus,
  error,
  onPath,
  onEdit,
  onMove,
  onRemove,
}: {
  kind: FolderKind;
  folder: Row;
  index: number;
  last: boolean;
  autoFocus: boolean;
  error: string | null;
  onPath: (path: string) => void;
  onEdit: (patch: Partial<ProfileFolder>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const info = KINDS[kind];
  const main = index === 0;
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
    <li className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 px-3 py-2.5">
      <div className="flex justify-center pt-1">
        {main ? (
          <Badge tone="accent">Main</Badge>
        ) : (
          <span className="pt-0.5 text-xs text-fg-4 tabular">{index + 1}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
          <InlineInput
            mono={false}
            value={folder.name}
            placeholder="Name"
            maxLength={60}
            onChange={(e) => onEdit({ name: e.target.value })}
            aria-label="Folder name"
            className="-ml-2 w-48 max-w-full font-medium"
          />
          <span className="flex items-center text-2xs text-fg-4">
            id
            <InlineInput
              value={folder.id}
              placeholder="id"
              maxLength={48}
              onChange={(e) => onEdit({ id: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
              aria-label="Folder id"
              className="h-6 w-40 text-fg-2"
            />
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {main ? null : (
          <IconButton
            size="sm"
            icon="crown"
            label="Make main"
            onClick={() => onMove(0)}
            className="max-lg:hidden"
          />
        )}
        <IconButton
          size="sm"
          icon="arrow-up"
          label="Move up"
          disabled={main}
          onClick={() => onMove(index - 1)}
        />
        <IconButton
          size="sm"
          icon="arrow-down"
          label="Move down"
          disabled={last}
          onClick={() => onMove(index + 1)}
        />
        <IconButton
          size="sm"
          icon="x"
          label="Remove from the list (files stay)"
          onClick={onRemove}
        />
      </div>
      {/* The path runs under the buttons too, full width on narrow screens. */}
      <div className="col-span-2 col-start-2 flex min-w-0 flex-col gap-1.5 max-lg:col-span-3 max-lg:col-start-1">
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
        {missing ? (
          <span className="flex items-center gap-1.5 text-xs text-danger">
            <Icon name="x-circle" size={13} />
            {checked?.exists ? "That's a file, not a folder." : "This folder doesn't exist."}
          </span>
        ) : null}
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </div>
    </li>
  );
}
