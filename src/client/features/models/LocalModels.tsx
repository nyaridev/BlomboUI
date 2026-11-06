/**
 * Models → Local: every file in the profile's models folders, as the one ModelCard. Kinds are
 * book tabs over one panel (as Generate's workspace); in it, the toolbar (search, base models,
 * favorites, sort and order, rescan) and the folder tree on the left (the pickers' FolderTree:
 * the kind folders on All, one top folder per models folder when there are several). A click on
 * a card opens its model info; right-click renames, moves and the rest. Sidecar images become
 * thumbnails. The grid is virtualized: a few
 * thousand LoRAs scroll like a dozen. Models without an info file are matched on Civitai by hash
 * in the background (status in the toolbar).
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useElementWidth } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import { formatBytes } from "@client/lib/number";
import {
  qk,
  useLocalModels,
  useModelDetails,
  useModelMarks,
  useMoveModel,
  useRenameModel,
  useSetModelFavorite,
  useSettings,
} from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  Badge,
  Button,
  Chip,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  KIND_STYLE,
  ModelCard,
  MultiSelect,
  openContextMenu,
  Select,
  Skeleton,
  Spinner,
  Tabs,
  TextField,
  Tooltip,
  toast,
} from "@client/ui";
import { groupBaseModels } from "@shared/basemodels";
import { MODEL_KINDS, type ModelKind } from "@shared/constants";
import { comfyNameOf, type LocalModel, modelKey } from "@shared/models";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { FolderTree } from "../generate/FolderTree";
import { folderTree, inFolder } from "../generate/folders";
import { shownPicture, useScopePick } from "../scopes/pick";
import { ScopeBar } from "../scopes/ScopeBar";
import { openModelInfo, useModelMenu } from "./actions";
import { useModelsNav } from "./nav";

type Sort = "name" | "path" | "created" | "modified" | "size";
type Order = "asc" | "desc";
/** Each sort with the order it starts in (dates and size newest / largest first). */
const SORTS: Array<{ value: Sort; label: string; icon: IconName; order: Order }> = [
  { value: "name", label: "Name", icon: "text", order: "asc" },
  { value: "path", label: "Path", icon: "folder", order: "asc" },
  { value: "created", label: "Date created", icon: "calendar", order: "desc" },
  { value: "modified", label: "Date modified", icon: "clock", order: "desc" },
  { value: "size", label: "Size", icon: "stack", order: "desc" },
];
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const COMPARE: Record<Sort, (a: LocalModel, b: LocalModel) => number> = {
  name: (a, b) => byText(a.name, b.name),
  path: (a, b) => byText(a.id, b.id),
  created: (a, b) => a.ctime - b.ctime,
  modified: (a, b) => a.mtime - b.mtime,
  size: (a, b) => a.size - b.size,
};
const MIN_CARD = 176;
const GAP = 12;

export function LocalModels() {
  const list = useLocalModels();
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const [kind, setKind] = useState<ModelKind | "all">("all");
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [baseModels, setBaseModels] = useState<string[]>([]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sort, setSort] = useState<Sort>("name");
  const [order, setOrder] = useState<Order>("asc");
  const [showTree, setShowTree] = useState(true);
  // The last opened card (or the one "Show in Models" asked for) stays outlined.
  const [selected, setSelected] = useState<string | null>(null);
  // "Show in Models" from a download or a Civitai page selects the file here.
  const wanted = useModelsNav((s) => s.select);
  useEffect(() => {
    if (!wanted || !list.data) return;
    useModelsNav.getState().takeSelect();
    setKind("all");
    setQuery("");
    setFolder(null);
    setBaseModels([]);
    setOnlyFavorites(false);
    setSelected(wanted);
  }, [wanted, list.data]);
  const [rescanning, setRescanning] = useState(false);
  // Rename and Move open from a card's right-click menu.
  const [dialog, setDialog] = useState<{
    type: "rename" | "move";
    model: LocalModel;
    open: boolean;
  } | null>(null);
  const modelMenu = useModelMenu();
  const menuFor = (m: LocalModel) =>
    modelMenu(m, {
      file: [
        {
          id: "rename",
          label: "Rename…",
          icon: "edit",
          onSelect: () => setDialog({ type: "rename", model: m, open: true }),
        },
        {
          id: "move",
          label: "Move…",
          icon: "move-to-folder",
          onSelect: () => setDialog({ type: "move", model: m, open: true }),
        },
      ],
    });
  // A renamed or moved model gets a new id: keep it selected if it was.
  const onMoved = (oldId: string, m: LocalModel) => setSelected((s) => (s === oldId ? m.id : s));
  const closeDialog = (o: boolean) => !o && setDialog((d) => d && { ...d, open: false });

  const marks = useModelMarks().data;
  const favorites = useMemo(() => new Set(marks?.favorites ?? []), [marks]);
  const isFavorite = (m: LocalModel) => favorites.has(modelKey(m.kind, comfyNameOf(m)));

  const models = list.data?.models ?? [];
  const roots = list.data?.folders ?? [];
  const counts = useMemo(() => {
    const c = new Map<ModelKind, number>();
    for (const m of models) c.set(m.kind, (c.get(m.kind) ?? 0) + 1);
    return c;
  }, [models]);
  const ofKind = useMemo(
    () => (kind === "all" ? models : models.filter((m) => m.kind === kind)),
    [models, kind],
  );
  const bases = useMemo(
    () => groupBaseModels(ofKind.map((m) => m.baseModel).filter((b): b is string => Boolean(b))),
    [ofKind],
  );
  // Tree paths: the models folder's name first when there are several, then the kind folder
  // on All ("B-Models/loras/style"), then the folders below it.
  const multiRoot = new Set(ofKind.map((m) => m.root)).size > 1;
  const lead = (multiRoot ? 1 : 0) + (kind === "all" ? 1 : 0);
  const treeKey = (m: LocalModel) => {
    const rel = kind === "all" ? m.id : m.id.slice(m.id.indexOf("/") + 1);
    const root = multiRoot ? roots.find((r) => r.id === m.root) : undefined;
    return root ? `${root.name}/${rel}` : rel;
  };
  // Search, base models and favorites first; the tree counts what they leave, the folder
  // narrows further.
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    const wantedBases = new Set(baseModels);
    return ofKind.filter(
      (m) =>
        (!wantedBases.size || wantedBases.has(m.baseModel ?? "")) &&
        (!onlyFavorites || favorites.has(modelKey(m.kind, comfyNameOf(m)))) &&
        (!q ||
          `${m.name} ${m.file} ${m.folder} ${m.baseModel ?? ""} ${m.triggerWords.join(" ")}`
            .toLowerCase()
            .includes(q)),
    );
  }, [ofKind, query, baseModels, onlyFavorites, favorites]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: treeKey follows kind, multiRoot and roots
  const tree = useMemo(() => folderTree(found.map(treeKey)), [found, kind, multiRoot, roots]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: treeKey follows kind, multiRoot and roots
  const shown = useMemo(() => {
    const compare = COMPARE[sort];
    return found
      .filter((m) => inFolder(treeKey(m), folder))
      .sort(order === "asc" ? compare : (a, b) => compare(b, a));
  }, [found, folder, sort, order, kind, multiRoot, roots]);

  /** Show a tree folder in Explorer: the part below the models folder's name and kind folder. */
  const revealFolder = (path: string) => {
    const m = found.find((x) => inFolder(treeKey(x), path));
    if (!m) return;
    const below = path.split("/").slice(lead).join("/");
    void api.openModelFolder(m.kind, below, m.root).catch((e: Error) => toast(e.message, "error"));
  };

  const rescan = async () => {
    setRescanning(true);
    try {
      qc.setQueryData(qk.localModels(profileId), await api.localModels(true));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setRescanning(false);
    }
  };

  if (list.isLoading)
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3 p-5">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4]" />
        ))}
      </div>
    );
  if (list.error)
    return (
      <EmptyState
        icon="errors"
        tone="warning"
        title="Couldn't read the models folder"
        text={list.error.message}
        action={<Button onClick={() => void list.refetch()}>Try again</Button>}
      />
    );
  if (list.data && !list.data.exists)
    return (
      <EmptyState
        icon="folder"
        tone="warning"
        title={
          list.data.folders.length
            ? "The models folder isn't there"
            : "This profile has no models folder"
        }
        text={
          list.data.folders.length
            ? `${list.data.folders.map((f) => f.path).join(", ")} doesn't exist anymore. Pick the folder again in Settings → Folders.`
            : "Add the folder that holds checkpoints/, loras/ and the rest in Settings → Folders."
        }
      />
    );

  const kinds = MODEL_KINDS.filter((k) => counts.get(k));
  const filtered = Boolean(query.trim() || baseModels.length || onlyFavorites || folder);
  const pickKind = (k: ModelKind | "all") => {
    // Another kind has other folders and base models.
    setKind(k);
    setFolder(null);
    setBaseModels([]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3 max-lg:p-2">
      <Tabs<ModelKind | "all">
        variant="folder"
        value={kind}
        onChange={pickKind}
        label="Model kinds"
        items={[
          {
            value: "all",
            label: "All",
            icon: "stack",
            badge: <Badge>{models.length.toLocaleString()}</Badge>,
          },
          ...kinds.map((k) => ({
            value: k,
            label: KIND_STYLE[k].label,
            icon: KIND_STYLE[k].icon,
            badge: <Badge>{(counts.get(k) ?? 0).toLocaleString()}</Badge>,
          })),
        ]}
      />
      {/* One panel under the tabs (book tabs: the active one joins it). */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3 rounded-lg border border-line bg-surface p-3",
          kind === "all" && "rounded-tl-none",
        )}
      >
        <div className="flex items-center gap-2 max-lg:flex-wrap">
          <IconButton
            icon="sidebar"
            label={showTree ? "Hide folders" : "Show folders"}
            variant="secondary"
            active={showTree}
            onClick={() => setShowTree((v) => !v)}
            className="max-lg:hidden"
          />
          <TextField
            icon="search"
            placeholder="Search name, folder, trigger word, base model…"
            className="min-w-0 flex-1 max-lg:basis-full"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            aria-label="Search models"
          />
          {bases.length ? (
            <MultiSelect
              value={baseModels}
              onChange={setBaseModels}
              label="Base models"
              clearLabel="All base models"
              className="w-52"
              options={bases.map((b) => ({ value: b.name, label: b.label, group: b.group }))}
            />
          ) : null}
          <Chip icon="heart" selected={onlyFavorites} onClick={() => setOnlyFavorites((v) => !v)}>
            Favorites
          </Chip>
          <ScopeBar className="max-w-96" />
          <div className="ml-auto flex items-center gap-2">
            <LookupStatus />
            <Select<Sort>
              value={sort}
              onChange={(s) => {
                setSort(s);
                setOrder(SORTS.find((x) => x.value === s)?.order ?? "asc");
              }}
              label="Sort"
              className="w-40"
              options={SORTS}
            />
            <IconButton
              icon={order === "asc" ? "sort-asc" : "sort-desc"}
              label={
                order === "asc"
                  ? "Ascending (click for descending)"
                  : "Descending (click for ascending)"
              }
              variant="secondary"
              onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
            />
            <IconButton
              icon="rescan-models"
              label="Scan the models folder again"
              variant="secondary"
              disabled={rescanning}
              onClick={() => void rescan()}
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 gap-3">
          {showTree && models.length ? (
            <FolderTree
              nodes={tree}
              total={found.length}
              folder={folder}
              onFolder={setFolder}
              onMenu={(e, path) =>
                // The models folder's own row (several models folders on All) has no one kind.
                path.split("/").length < lead
                  ? undefined
                  : openContextMenu(e, [
                      {
                        id: "open",
                        label: "Show in Explorer",
                        icon: "folder-open",
                        onSelect: () => revealFolder(path),
                      },
                    ])
              }
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col">
            {shown.length === 0 ? (
              <EmptyState
                icon={models.length ? "search" : "models"}
                title={models.length ? "No models match" : "No models yet"}
                text={
                  models.length
                    ? filtered
                      ? "Nothing here with this search and these filters."
                      : "Nothing of this kind yet."
                    : "Put model files in checkpoints/, loras/, vae/ and the other folders of your models folder, then scan again."
                }
              />
            ) : (
              <CardGrid
                models={shown}
                selected={selected}
                isFavorite={isFavorite}
                onOpen={(m) => {
                  setSelected(m.id);
                  openModelInfo(m.id);
                }}
                onMenu={(e, m) => openContextMenu(e, menuFor(m))}
              />
            )}
          </div>
        </div>
      </div>
      {dialog?.type === "rename" ? (
        <RenameDialog
          key={dialog.model.id}
          model={dialog.model}
          open={dialog.open}
          onOpenChange={closeDialog}
          onDone={(m) => onMoved(dialog.model.id, m)}
        />
      ) : dialog?.type === "move" ? (
        <MoveDialog
          key={dialog.model.id}
          model={dialog.model}
          open={dialog.open}
          onOpenChange={closeDialog}
          onDone={(m) => onMoved(dialog.model.id, m)}
        />
      ) : null}
    </div>
  );
}

function CardGrid({
  models,
  selected,
  isFavorite,
  onOpen,
  onMenu,
}: {
  models: LocalModel[];
  selected: string | null;
  isFavorite: (m: LocalModel) => boolean;
  onOpen: (m: LocalModel) => void;
  onMenu: (e: MouseEvent<HTMLElement>, m: LocalModel) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(innerRef);
  const minCard = MIN_CARD * (useSettings().data?.ui.modelsCardScale ?? 1);
  const cols = Math.max(1, Math.floor((width + GAP) / (minCard + GAP)));
  const cardW = width > 0 ? (width - GAP * (cols - 1)) / cols : minCard;
  const rowH = Math.round((cardW * 4) / 3) + GAP;
  const rows = Math.ceil(models.length / cols);
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 3,
  });
  const setFavorite = useSetModelFavorite();
  const pick = useScopePick((s) => s.pick);
  // Card size follows the width; re-measure when it changes.
  useEffect(() => {
    if (rowH > 0) virtualizer.measure();
  }, [rowH, virtualizer]);
  return (
    <div ref={scrollRef} className="scroll-quiet min-h-0 flex-1 overflow-y-auto pr-1">
      <div
        ref={innerRef}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((v) => (
          <div
            key={v.key}
            className="absolute inset-x-0 top-0 grid"
            style={{
              transform: `translateY(${v.start}px)`,
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: GAP,
            }}
          >
            {models.slice(v.index * cols, v.index * cols + cols).map((m) => (
              <ModelCard
                key={m.id}
                name={m.name}
                kind={m.kind}
                baseModel={m.baseModel ?? undefined}
                thumb={shownPicture(m, pick).thumb}
                favorite={isFavorite(m)}
                onFavorite={() =>
                  setFavorite.mutate({
                    kind: m.kind,
                    name: comfyNameOf(m),
                    favorite: !isFavorite(m),
                  })
                }
                meta={formatBytes(m.size)}
                selected={selected === m.id}
                onClick={() => onOpen(m)}
                onContextMenu={(e) => onMenu(e, m)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const stemOf = (file: string) => file.replace(/\.[^.]+$/, "");

function RenameDialog({
  model,
  open,
  onOpenChange,
  onDone,
}: {
  model: LocalModel;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: (m: LocalModel) => void;
}) {
  const [name, setName] = useState<string | null>(null);
  const rename = useRenameModel();
  const value = name ?? stemOf(model.file);
  const ext = model.file.slice(stemOf(model.file).length);
  const bad = /[\\/:*?"<>|]/.test(value);
  const submit = () =>
    rename.mutate(
      { id: model.id, name: value.trim() },
      {
        onSuccess: (m) => {
          toast(`Renamed to "${m.file}"`, "success");
          onDone(m);
          onOpenChange(false);
          setName(null);
        },
        onError: (e) => toast(e.message, "error"),
      },
    );
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setName(null);
      }}
      title="Rename model"
      description="Its preview image and info files are renamed with it. Workflows that name the old file need the new name."
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={rename.isPending}
            disabled={!value.trim() || bad || value === stemOf(model.file)}
            onClick={submit}
          >
            Rename
          </Button>
        </>
      }
    >
      <Field label="File name" error={bad ? 'Use a name without \\ / : * ? " < > |' : undefined}>
        {(id) => (
          <TextField
            id={id}
            value={value}
            autoFocus
            invalid={bad}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !bad && submit()}
            trailing={<span className="font-mono text-xs text-fg-3">{ext}</span>}
          />
        )}
      </Field>
    </Dialog>
  );
}

function MoveDialog({
  model,
  open,
  onOpenChange,
  onDone,
}: {
  model: LocalModel;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: (m: LocalModel) => void;
}) {
  const folders = useModelDetails(model.id).data?.folders;
  const [folder, setFolder] = useState<string | null>(null);
  const move = useMoveModel();
  const value = folder ?? model.folder;
  const kindFolder = model.id.split("/")[0] ?? "";
  const options = useMemo(
    () => [
      { value: "", label: `${kindFolder}/ (top level)`, icon: "folder" as IconName },
      ...(folders ?? []).map((f) => ({ value: f, label: f, icon: "folder" as IconName })),
    ],
    [folders, kindFolder],
  );
  const submit = () =>
    move.mutate(
      { id: model.id, folder: value.trim() },
      {
        onSuccess: (m) => {
          toast(`Moved "${m.file}" to ${m.folder || `${kindFolder}/`}`, "success");
          onDone(m);
          onOpenChange(false);
          setFolder(null);
        },
        onError: (e) => toast(e.message, "error"),
      },
    );
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setFolder(null);
      }}
      title="Move model"
      description={`Moves "${model.file}" and the files next to it to another folder inside ${kindFolder}/.`}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="move-to-folder"
            loading={move.isPending}
            disabled={value === model.folder}
            onClick={submit}
          >
            Move
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Existing folder">
          <Select
            value={options.some((o) => o.value === value) ? value : null}
            onChange={setFolder}
            options={options}
            placeholder="New folder below"
          />
        </Field>
        <Field
          label="Or type a folder"
          hint="Folders that don't exist yet are created. Use / for subfolders."
        >
          {(id) => (
            <TextField
              id={id}
              value={value}
              onChange={(e) => setFolder(e.target.value)}
              mono
              icon="folder"
              placeholder="style/anime"
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** "Matching on Civitai 12 / 340" while local models are hashed and looked up. */
function LookupStatus() {
  const lookup = useLive((s) => s.lookup);
  // The bus reports changes; ask once for where it stands now.
  useEffect(() => {
    if (!useLive.getState().lookup)
      void api.modelLookup().then(
        (l) => useLive.setState({ lookup: l }),
        () => undefined,
      );
  }, []);
  if (!lookup) return null;
  if (lookup.running)
    return (
      <Tooltip
        content={lookup.current ? `Hashing ${lookup.current}` : "Matching local models on Civitai"}
      >
        <span className="flex items-center gap-1.5 text-xs text-fg-3 tabular">
          <Spinner size={13} />
          Matching on Civitai {lookup.done} / {lookup.total}
        </span>
      </Tooltip>
    );
  if (lookup.error)
    return (
      <Tooltip content={lookup.error}>
        <span className="flex items-center gap-1 text-xs text-warning">
          <Icon name="info" size={13} />
          Civitai matching paused
        </span>
      </Tooltip>
    );
  return null;
}
