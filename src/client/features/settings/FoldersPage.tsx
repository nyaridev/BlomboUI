/**
 * Settings → Folders: ordered lists of models, output and wildcards folders (ADR-0017). The first
 * of each kind is the main one: downloads, generated images and batch results go there. The others
 * are only read (and edited in place). Changes are a draft until Save, since a new models list
 * restarts a managed ComfyUI.
 */

import type { IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useUpdateProfile } from "@client/lib/queries";
import { Badge, Button, IconButton, InlineInput, SectionTitle, toast } from "@client/ui";
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
  { title: string; icon: IconName; hint: string; empty: string; label: string }
> = {
  models: {
    title: "Models",
    icon: "models",
    label: "Models",
    hint: "ComfyUI and the Models page read every folder; when two hold the same file, the higher one wins. Downloads go into the main one. A managed ComfyUI restarts to see a change.",
    empty: "No models folder yet. Add the one with checkpoints/, loras/, vae/…",
  },
  outputs: {
    title: "Outputs",
    icon: "gallery",
    label: "Outputs",
    hint: "Generated images and batch results are saved in the main one. The gallery shows them all together, or one folder at a time from its sidebar.",
    empty: "No output folder yet. Add one to save what you generate.",
  },
  wildcards: {
    title: "Wildcards",
    icon: "wildcards",
    label: "Wildcards",
    hint: "__wildcards__ in prompts come from every folder; when two have the same name, the higher one wins.",
    empty: "No wildcards folder yet. Add one with .txt or .yaml files.",
  },
};

const NONE: ProfileFolders = { models: [], outputs: [], wildcards: [] };

/** What's wrong with a row, or null. */
function problem(list: ProfileFolder[], i: number): string | null {
  const f = list[i];
  if (!f) return null;
  if (!f.name.trim()) return "Give it a name.";
  const id = FolderId.safeParse(f.id);
  if (!id.success) return "Ids use a-z, 0-9 and dashes, and start with a letter or digit.";
  if (list.findIndex((o) => o.id === f.id) !== i) return `Another folder already uses "${f.id}".`;
  return null;
}

export function FoldersPage({ profile }: { profile: Profile | undefined }) {
  const update = useUpdateProfile();
  const [draft, setDraft] = useState<ProfileFolders>(profile?.folders ?? NONE);
  useEffect(() => {
    if (profile) setDraft(profile.folders);
  }, [profile]);
  const dirty = profile !== undefined && JSON.stringify(draft) !== JSON.stringify(profile.folders);
  const invalid = FOLDER_KINDS.some((k) => draft[k].some((_, i) => problem(draft[k], i)));

  const setList = (kind: FolderKind, list: ProfileFolder[]) =>
    setDraft((d) => ({ ...d, [kind]: list }));

  const save = () => {
    if (!profile) return;
    const folders = Object.fromEntries(
      FOLDER_KINDS.map((k) => [
        k,
        draft[k].map((f) => ({ id: f.id, name: f.name.trim(), path: f.path.trim() })),
      ]),
    ) as ProfileFolders;
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
          onChange={(list) => setList(kind, list)}
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
          <Button variant="ghost" onClick={() => profile && setDraft(profile.folders)}>
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
  list: ProfileFolder[];
  onChange: (list: ProfileFolder[]) => void;
}) {
  const info = KINDS[kind];
  const [picking, setPicking] = useState(false);

  const pick = async (title: string, initial?: string): Promise<string | null> => {
    setPicking(true);
    try {
      return (await api.pickFolder(title, initial)).path ?? null;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't open the folder picker.", "error");
      return null;
    } finally {
      setPicking(false);
    }
  };
  const taken = (p: string, except = -1) =>
    list.some((f, i) => i !== except && f.path.toLowerCase() === p.toLowerCase());

  const add = async () => {
    const p = await pick(`Add a ${info.label.toLowerCase()} folder`);
    if (!p) return;
    if (taken(p)) return toast("That folder is already in the list.", "error");
    const name = folderNameOf(p, info.label);
    const ids = list.map((f) => f.id);
    // The first folder of a kind keeps the main id, so the gallery's marks find it.
    const id = list.length ? folderIdFrom(name, ids) : MAIN_FOLDER_IDS[kind];
    onChange([...list, { id, name, path: p }]);
  };
  const change = async (i: number) => {
    const p = await pick(`Choose the folder for ${list[i]?.name}`, list[i]?.path);
    if (!p) return;
    if (taken(p, i)) return toast("That folder is already in the list.", "error");
    onChange(list.map((f, j) => (j === i ? { ...f, path: p } : f)));
  };
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
      <SectionTitle
        icon={info.icon}
        actions={
          <Button size="sm" icon="folder-plus" loading={picking} onClick={add}>
            Add folder
          </Button>
        }
      >
        {info.title}
      </SectionTitle>
      <p className="max-w-[72ch] text-xs text-fg-3 text-pretty">{info.hint}</p>
      {list.length ? (
        <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {list.map((f, i) => (
            <FolderRow
              key={`${i}:${f.path}`}
              folder={f}
              index={i}
              last={i === list.length - 1}
              error={problem(list, i)}
              onEdit={(patch) => edit(i, patch)}
              onMove={(to) => move(i, to)}
              onChangePath={() => change(i)}
              onRemove={() => onChange(list.filter((_, j) => j !== i))}
            />
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-sm text-fg-3">
          {info.empty}
        </p>
      )}
    </section>
  );
}

function FolderRow({
  folder,
  index,
  last,
  error,
  onEdit,
  onMove,
  onChangePath,
  onRemove,
}: {
  folder: ProfileFolder;
  index: number;
  last: boolean;
  error: string | null;
  onEdit: (patch: Partial<ProfileFolder>) => void;
  onMove: (to: number) => void;
  onChangePath: () => void;
  onRemove: () => void;
}) {
  const main = index === 0;
  const check = useQuery({
    queryKey: ["check-path", folder.path],
    queryFn: () => api.checkPath(folder.path),
    staleTime: 5_000,
  });
  const missing = check.data && (!check.data.exists || !check.data.isDirectory);
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <div className="flex w-12 shrink-0 justify-center pt-1">
        {main ? (
          <Badge tone="accent">Main</Badge>
        ) : (
          <span className="pt-0.5 text-xs text-fg-4 tabular">{index + 1}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
          <InlineInput
            mono={false}
            value={folder.name}
            maxLength={60}
            onChange={(e) => onEdit({ name: e.target.value })}
            aria-label="Folder name"
            className="-ml-2 w-48 max-w-full font-medium"
          />
          <span className="flex items-center text-2xs text-fg-4">
            id
            <InlineInput
              value={folder.id}
              maxLength={48}
              onChange={(e) => onEdit({ id: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
              aria-label="Folder id"
              className="h-6 w-40 text-fg-2"
            />
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs text-fg-3" title={folder.path}>
            {folder.path}
          </span>
          {missing ? <Badge tone="warning">Not found</Badge> : null}
        </div>
        {error ? <span className="text-xs text-danger">{error}</span> : null}
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
        <IconButton size="sm" icon="folder-open" label="Change folder" onClick={onChangePath} />
        <IconButton
          size="sm"
          icon="x"
          label="Remove from the list (files stay)"
          onClick={onRemove}
        />
      </div>
    </li>
  );
}
