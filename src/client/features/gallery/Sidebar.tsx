/**
 * Gallery sidebar: views, libraries (outputs + extra folders), collections (virtual albums
 * across folders), trash and the scan status.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useLive } from "@client/lib/live";
import { qk, useAddLibrary, useCollections, useRemoveLibrary } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Button, Dialog, Field, IconButton, Menu, ProgressBar, TextField, toast } from "@client/ui";
import type { Collection, GalleryOverview, LibraryInfo } from "@shared/gallery";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FolderField } from "../profiles/FolderField";
import { useGalleryUi } from "./state";

const WEEK_MS = 7 * 24 * 3600 * 1000;

export function Sidebar({ overview }: { overview: GalleryOverview | undefined }) {
  const ui = useGalleryUi();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<LibraryInfo | null>(null);
  const remove = useRemoveLibrary();
  const collections = useCollections();
  const [naming, setNaming] = useState<Collection | "new" | null>(null);
  const counts = overview?.counts;
  const isView = (v: "all" | "favorites" | "week") =>
    ui.view === "images" &&
    ui.library === "all" &&
    !ui.collection &&
    (v === "favorites"
      ? ui.favorites
      : v === "week"
        ? Boolean(ui.since) && !ui.favorites
        : !ui.favorites && !ui.since);

  return (
    <aside className="scroll-quiet flex w-[248px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-3">
      <SideItem
        active={isView("all")}
        onClick={() =>
          ui.set({
            view: "images",
            library: "all",
            favorites: false,
            since: null,
            collection: null,
          })
        }
        icon="gallery"
        label="All images"
        count={counts?.all}
      />
      <SideItem
        active={isView("favorites")}
        onClick={() =>
          ui.set({ view: "images", library: "all", favorites: true, since: null, collection: null })
        }
        icon="heart"
        label="Favorites"
        count={counts?.favorites}
      />
      <SideItem
        active={isView("week")}
        onClick={() =>
          ui.set({
            view: "images",
            library: "all",
            favorites: false,
            since: Date.now() - WEEK_MS,
            collection: null,
          })
        }
        icon="calendar"
        label="This week"
        count={counts?.week}
      />

      <div className="label-caps mt-4 mb-1 flex items-center justify-between px-2 text-[10px]">
        Libraries
        <IconButton
          icon="folder-plus"
          label="Add a folder"
          size="xs"
          onClick={() => setAdding(true)}
        />
      </div>
      {overview?.libraries.map((lib) => (
        <div key={lib.id} className="group relative">
          <button
            type="button"
            onClick={() =>
              ui.set({
                view: "images",
                library: lib.id,
                favorites: false,
                since: null,
                collection: null,
              })
            }
            title={lib.path || "Set an outputs folder in Settings → Folders"}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md p-1.5 pr-8 text-left transition-colors focus-ring",
              ui.view === "images" && ui.library === lib.id && !ui.collection
                ? "bg-field"
                : "hover:bg-field/60",
            )}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-sunken text-fg-3">
              {lib.cover ? (
                <img src={lib.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <Icon
                  name={lib.exists ? "folder" : "errors"}
                  size={16}
                  className={lib.exists ? undefined : "text-warning"}
                />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn("truncate text-sm", ui.library === lib.id ? "text-fg" : "text-fg-2")}
              >
                {lib.name}
              </span>
              <span
                className={cn(
                  "truncate text-2xs",
                  lib.exists ? "font-mono text-fg-3 tabular" : "text-warning",
                )}
              >
                {!lib.path
                  ? "No outputs folder set"
                  : lib.exists
                    ? lib.count.toLocaleString()
                    : "Folder not found"}
              </span>
            </span>
          </button>
          {lib.builtin ? null : (
            <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Menu
                width={210}
                trigger={
                  <IconButton icon="more-horizontal" label={`${lib.name} options`} size="xs" />
                }
                items={[
                  { id: "rename", label: "Rename", icon: "edit", onSelect: () => setRenaming(lib) },
                  {
                    id: "remove",
                    label: "Remove from gallery",
                    icon: "x",
                    tone: "danger",
                    hint: <span className="text-2xs text-fg-4">files stay</span>,
                    onSelect: () =>
                      remove.mutate(lib.id, {
                        onSuccess: () => {
                          toast(
                            `Removed "${lib.name}" from the gallery. Its files are untouched.`,
                            "success",
                          );
                          if (useGalleryUi.getState().library === lib.id)
                            useGalleryUi.getState().reset();
                        },
                        onError: (e) => toast(e.message, "error"),
                      }),
                  },
                ]}
              />
            </div>
          )}
        </div>
      ))}

      <div className="label-caps mt-4 mb-1 flex items-center justify-between px-2 text-[10px]">
        Collections
        <IconButton icon="plus" label="New collection" size="xs" onClick={() => setNaming("new")} />
      </div>
      {collections.data?.length ? (
        collections.data.map((c) => (
          <div key={c.id} className="group relative">
            <button
              type="button"
              onClick={() =>
                ui.set({
                  view: "images",
                  library: "all",
                  favorites: false,
                  since: null,
                  collection: c.id,
                })
              }
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md p-1.5 pr-8 text-left transition-colors focus-ring",
                ui.view === "images" && ui.collection === c.id ? "bg-field" : "hover:bg-field/60",
              )}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-sunken text-fg-3">
                {c.cover ? (
                  <img src={c.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="stack" size={16} />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    "truncate text-sm",
                    ui.collection === c.id ? "text-fg" : "text-fg-2",
                  )}
                >
                  {c.name}
                </span>
                <span className="font-mono text-2xs text-fg-3 tabular">
                  {c.count.toLocaleString()}
                </span>
              </span>
            </button>
            <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Menu
                width={210}
                trigger={
                  <IconButton icon="more-horizontal" label={`${c.name} options`} size="xs" />
                }
                items={[
                  { id: "rename", label: "Rename", icon: "edit", onSelect: () => setNaming(c) },
                  {
                    id: "remove",
                    label: "Remove collection",
                    icon: "x",
                    tone: "danger",
                    hint: <span className="text-2xs text-fg-4">images stay</span>,
                    onSelect: () =>
                      void api
                        .removeCollection(c.id)
                        .then(() => {
                          toast(`Removed "${c.name}". Its images are untouched.`, "success");
                          if (useGalleryUi.getState().collection === c.id)
                            useGalleryUi.getState().reset();
                        })
                        .catch((e: Error) => toast(e.message, "error")),
                  },
                ]}
              />
            </div>
          </div>
        ))
      ) : (
        <p className="px-2 text-2xs text-fg-4">
          Albums across folders. Add images from the lightbox.
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-4">
        <SideItem
          active={ui.view === "trash"}
          onClick={() => ui.set({ view: "trash" })}
          icon="trash"
          label="Trash"
          count={counts?.trash}
        />
        <SyncStatus overview={overview} />
      </div>
      <AddLibraryDialog open={adding} onOpenChange={setAdding} />
      <RenameLibraryDialog library={renaming} onClose={() => setRenaming(null)} />
      <CollectionDialog naming={naming} onClose={() => setNaming(null)} />
    </aside>
  );
}

function SideItem({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active || undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors focus-ring",
        active ? "bg-field text-fg" : "text-fg-2 hover:bg-field/60 hover:text-fg",
      )}
    >
      <Icon name={icon} size={15} className={active ? "text-accent-ink" : "text-fg-3"} />
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined ? (
        <span className="font-mono text-2xs text-fg-3 tabular">{count.toLocaleString()}</span>
      ) : null}
    </button>
  );
}

function SyncStatus({ overview }: { overview: GalleryOverview | undefined }) {
  const live = useLive((s) => s.gallerySync);
  const sync = live ?? overview?.sync;
  const qc = useQueryClient();
  const rescan = () =>
    void api
      .gallerySync()
      .then((s) => useLive.setState({ gallerySync: s }))
      .catch((e: Error) => toast(e.message, "error"))
      .finally(() => qc.invalidateQueries({ queryKey: ["gallery"] }));
  if (!sync) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-2">
      <div className="flex items-center gap-2 text-2xs">
        {sync.running ? (
          <span className="flex-1 text-fg-2">
            Reading folders… <span className="font-mono tabular">{sync.done.toLocaleString()}</span>
            {sync.total ? (
              <span className="font-mono text-fg-3 tabular"> / {sync.total.toLocaleString()}</span>
            ) : null}
          </span>
        ) : sync.error ? (
          <span className="flex flex-1 items-start gap-1 text-warning">
            <Icon name="errors" size={12} className="mt-px shrink-0" />
            {sync.error}
          </span>
        ) : (
          <span className="flex flex-1 items-center gap-1 text-fg-3">
            <Icon name="check" size={12} />
            {sync.finishedAt ? "Up to date" : "Not scanned yet"}
          </span>
        )}
        <IconButton
          icon="refresh"
          label="Scan folders again"
          size="xs"
          disabled={sync.running}
          onClick={rescan}
        />
      </div>
      {sync.running ? (
        <ProgressBar
          size="sm"
          label="Scanning folders"
          value={sync.total ? Math.min(1, sync.done / sync.total) : null}
        />
      ) : null}
    </div>
  );
}

function AddLibraryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const add = useAddLibrary();
  const submit = () =>
    add.mutate(
      {
        name: name.trim() || folder.split(/[\\/]/).filter(Boolean).pop() || "Library",
        path: folder,
      },
      {
        onSuccess: (lib) => {
          toast(`Added "${lib.name}". Its images appear as they're read.`, "success");
          useGalleryUi
            .getState()
            .set({ view: "images", library: lib.id, favorites: false, since: null });
          setName("");
          setFolder("");
          onOpenChange(false);
        },
        onError: (e) => toast(e.message, "error"),
      },
    );
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a folder to the gallery"
      description="Images in it (and its subfolders) show up next to your outputs. Nothing in the folder is changed."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="folder-plus"
            disabled={!folder.trim()}
            loading={add.isPending}
            onClick={submit}
          >
            Add folder
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Folder">
          {(id) => (
            <FolderField
              id={id}
              value={folder}
              onChange={setFolder}
              pickTitle="Choose a folder of images"
              placeholder="D:\Pictures\Renders"
            />
          )}
        </Field>
        <Field label="Name" hint="Shown in the sidebar. Defaults to the folder's name.">
          {(id) => (
            <TextField
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="References"
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function RenameLibraryDialog({
  library,
  onClose,
}: {
  library: LibraryInfo | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const shown = library ? name || library.name : "";
  const save = async () => {
    if (!library) return;
    setBusy(true);
    try {
      await api.renameLibrary(library.id, shown.trim());
      await qc.invalidateQueries({ queryKey: ["gallery"] });
      onClose();
      setName("");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={library !== null}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setName("");
        }
      }}
      title="Rename library"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!shown.trim()}
            loading={busy}
            onClick={() => void save()}
          >
            Rename
          </Button>
        </>
      }
    >
      <Field label="Name">
        {(id) => (
          <TextField
            id={id}
            value={shown}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save()}
          />
        )}
      </Field>
    </Dialog>
  );
}

/** Name a new collection or rename one. */
function CollectionDialog({
  naming,
  onClose,
}: {
  naming: Collection | "new" | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const current = naming && naming !== "new" ? naming : null;
  useEffect(() => setName(current?.name ?? ""), [current]);
  const save = async () => {
    if (!name.trim()) return;
    try {
      if (current) await api.renameCollection(current.id, name.trim());
      else {
        const c = await api.createCollection(name.trim());
        useGalleryUi.getState().set({ view: "images", library: "all", collection: c.id });
      }
      void qc.invalidateQueries({ queryKey: qk.collections(profileId) });
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };
  return (
    <Dialog
      open={naming !== null}
      onOpenChange={(o) => !o && onClose()}
      title={current ? "Rename collection" : "New collection"}
      description={
        current ? undefined : "An album that can hold images from any library. Files don't move."
      }
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>
            {current ? "Rename" : "Create"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Name">
          <TextField
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Portfolio"
            autoFocus
          />
        </Field>
      </form>
    </Dialog>
  );
}
