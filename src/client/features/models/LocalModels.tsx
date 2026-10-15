/**
 * Models → Local: every file in the profile's models folder, by kind, as the one ModelCard.
 * Sidecar images become thumbnails (blurred when marked NSFW, per the profile setting), and the
 * info sheet shows the sidecar info and the safetensors header, with rename, move, reveal and
 * File Info. The grid is virtualized: a few thousand LoRAs scroll like a dozen.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useElementWidth } from "@client/lib/hooks";
import { formatBytes } from "@client/lib/number";
import {
  qk,
  useLocalModels,
  useModelDetails,
  useMoveModel,
  useRenameModel,
  useSettings,
} from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  Button,
  Chip,
  CopyButton,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  KIND_STYLE,
  ModelCard,
  PropertyList,
  Select,
  Skeleton,
  TextField,
  toast,
} from "@client/ui";
import { MODEL_KINDS, type ModelKind } from "@shared/constants";
import type { LocalModel, ModelDetails } from "@shared/models";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFileInfoTarget } from "../fileinfo/state";

type Sort = "name" | "size" | "added";
const MIN_CARD = 176;
const GAP = 12;

export function LocalModels() {
  const list = useLocalModels();
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const [kind, setKind] = useState<ModelKind | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [selected, setSelected] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);

  const models = list.data?.models ?? [];
  const counts = useMemo(() => {
    const c = new Map<ModelKind, number>();
    for (const m of models) c.set(m.kind, (c.get(m.kind) ?? 0) + 1);
    return c;
  }, [models]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = models.filter(
      (m) =>
        (kind === "all" || m.kind === kind) &&
        (!q ||
          `${m.name} ${m.file} ${m.folder} ${m.baseModel ?? ""} ${m.triggerWords.join(" ")}`
            .toLowerCase()
            .includes(q)),
    );
    if (sort === "size") out.sort((a, b) => b.size - a.size);
    else if (sort === "added") out.sort((a, b) => b.mtime - a.mtime);
    else out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [models, kind, query, sort]);

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
  if (list.data && (!list.data.root || !list.data.exists))
    return (
      <EmptyState
        icon="folder"
        tone="warning"
        title={
          list.data.root ? "The models folder isn't there" : "This profile has no models folder"
        }
        text={
          list.data.root
            ? `${list.data.root} doesn't exist anymore. Pick the folder again in Settings → Folders.`
            : "Choose the folder that holds checkpoints/, loras/ and the rest in Settings → Folders."
        }
      />
    );

  const kinds = MODEL_KINDS.filter((k) => counts.get(k));
  const current = selected ? models.find((m) => m.id === selected) : undefined;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5 pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <TextField
            icon="search"
            placeholder="Search name, folder, trigger word, base model…"
            className="w-[340px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            aria-label="Search models"
          />
          <div className="flex flex-wrap gap-1">
            <Chip
              size="sm"
              icon="stack"
              count={models.length}
              selected={kind === "all"}
              onClick={() => setKind("all")}
            >
              All
            </Chip>
            {kinds.map((k) => (
              <Chip
                key={k}
                size="sm"
                icon={KIND_STYLE[k].icon}
                count={counts.get(k)}
                selected={kind === k}
                onClick={() => setKind(k)}
              >
                {KIND_STYLE[k].label}
              </Chip>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Select<Sort>
              size="sm"
              value={sort}
              onChange={setSort}
              label="Sort"
              className="w-[140px]"
              options={[
                { value: "name", label: "Name", icon: "sort" },
                { value: "added", label: "Newest files", icon: "calendar" },
                { value: "size", label: "Largest first", icon: "stack" },
              ]}
            />
            <IconButton
              icon="rescan-models"
              label="Scan the models folder again"
              variant="secondary"
              size="sm"
              disabled={rescanning}
              onClick={() => void rescan()}
            />
          </div>
        </div>
        {shown.length === 0 ? (
          <EmptyState
            icon="models"
            title={models.length ? "No models match" : "No models yet"}
            text={
              models.length
                ? "Try another search or kind."
                : "Put model files in checkpoints/, loras/, vae/ and the other folders of your models folder, then scan again."
            }
          />
        ) : (
          <CardGrid
            models={shown}
            blurNsfw={blurNsfw}
            selected={selected}
            onSelect={(id) => setSelected((s) => (s === id ? null : id))}
          />
        )}
      </div>
      <AnimatePresence initial={false}>
        {current ? (
          <motion.aside
            key="sheet"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 40 }}
            className="shrink-0 overflow-hidden border-l border-line bg-surface"
          >
            <InfoSheet
              model={current}
              blurNsfw={blurNsfw}
              onClose={() => setSelected(null)}
              onMoved={(m) => setSelected(m.id)}
            />
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function CardGrid({
  models,
  blurNsfw,
  selected,
  onSelect,
}: {
  models: LocalModel[];
  blurNsfw: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(innerRef);
  const cols = Math.max(1, Math.floor((width + GAP) / (MIN_CARD + GAP)));
  const cardW = width > 0 ? (width - GAP * (cols - 1)) / cols : MIN_CARD;
  const rowH = Math.round((cardW * 4) / 3) + GAP;
  const rows = Math.ceil(models.length / cols);
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 3,
  });
  // Card size follows the width; re-measure when it changes.
  useEffect(() => {
    if (rowH > 0) virtualizer.measure();
  }, [rowH, virtualizer]);
  return (
    <div ref={scrollRef} className="scroll-quiet min-h-0 flex-1 overflow-y-auto pr-1 pb-5">
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
                thumb={m.thumb}
                nsfw={m.nsfw}
                blurNsfw={blurNsfw}
                meta={formatBytes(m.size)}
                selected={selected === m.id}
                onClick={() => onSelect(m.id)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── info sheet ───────────────────────────────────────────────────────────── */

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

function InfoSheet({
  model,
  blurNsfw,
  onClose,
  onMoved,
}: {
  model: LocalModel;
  blurNsfw: boolean;
  onClose: () => void;
  onMoved: (m: LocalModel) => void;
}) {
  const details = useModelDetails(model.id);
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const setTarget = useFileInfoTarget((s) => s.set);
  const navigate = useNavigate();
  const profileId = useSession((s) => s.profileId);
  const d = details.data;
  const style = KIND_STYLE[model.kind];
  const description = useMemo(
    () => (d?.description ? stripHtml(d.description) : null),
    [d?.description],
  );

  return (
    <div className="flex h-full w-[380px] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Icon name={style.icon} size={15} className="text-fg-3" />
        <span className="truncate text-sm font-semibold text-fg">{style.label}</span>
        <IconButton icon="x" label="Close" size="sm" className="ml-auto" onClick={onClose} />
      </div>
      <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="mx-auto w-40">
          <ModelCard
            name={model.name}
            kind={model.kind}
            baseModel={model.baseModel ?? undefined}
            thumb={model.thumb}
            nsfw={model.nsfw}
            blurNsfw={blurNsfw}
          />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold break-words text-fg">{model.name}</h2>
          <span className="font-mono text-2xs break-all text-fg-3">{model.id}</span>
        </div>
        {model.triggerWords.length ? (
          <div className="flex flex-col gap-1.5">
            <span className="label-caps">Trigger words</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {model.triggerWords.map((w) => (
                <Chip
                  key={w}
                  size="sm"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(w)
                      .then(() => toast(`Copied "${w}"`, "success"))
                  }
                >
                  {w}
                </Chip>
              ))}
              <CopyButton text={model.triggerWords.join(", ")} label="Copy all trigger words" />
            </div>
          </div>
        ) : null}
        {details.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : details.error ? (
          <p className="text-sm text-danger">{details.error.message}</p>
        ) : d ? (
          <>
            <PropertyList
              items={[
                { label: "File", value: d.file, copy: d.file },
                { label: "Folder", value: d.folder || "(top level)" },
                { label: "Size", value: formatBytes(d.size) },
                { label: "Added", value: new Date(d.mtime).toLocaleDateString() },
                { label: "Base model", value: d.header?.training.baseModel ?? d.baseModel },
                { label: "Weight", value: d.weight },
                {
                  label: "Network",
                  value: d.header?.training.network
                    ? `${d.header.training.network}${d.header.training.dim ? ` · rank ${d.header.training.dim}` : ""}`
                    : null,
                },
                {
                  label: "Civitai",
                  value: d.civitai?.url ? (
                    <a
                      href={d.civitai.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-accent-ink hover:underline"
                    >
                      {[d.civitai.name, d.civitai.version].filter(Boolean).join(" · ") ||
                        "Open page"}
                      <Icon name="external" size={12} />
                    </a>
                  ) : null,
                },
                { label: "Creator", value: d.civitai?.creator },
              ]}
            />
            {d.headerError ? <p className="text-xs text-warning">{d.headerError}</p> : null}
            {description ? (
              <div className="flex flex-col gap-1.5">
                <span className="label-caps">Description</span>
                <p className="max-h-48 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-fg-2">
                  {description}
                </p>
              </div>
            ) : null}
            {d.notes ? (
              <div className="flex flex-col gap-1.5">
                <span className="label-caps">Notes</span>
                <p className="text-sm whitespace-pre-wrap text-fg-2">{d.notes}</p>
              </div>
            ) : null}
            {d.sidecars.length ? (
              <div className="flex flex-col gap-1.5">
                <span className="label-caps">Files next to it</span>
                <ul className="flex flex-col gap-0.5">
                  {d.sidecars.map((f) => (
                    <li key={f} className="truncate font-mono text-2xs text-fg-3">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!d.civitai && !d.header?.training.baseModel && !model.hasInfo ? (
              <p className="rounded-md border border-dashed border-line px-3 py-2 text-xs text-fg-3">
                No info file next to this model. Civitai lookup arrives with the Civitai browser.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-1.5 border-t border-line p-3">
        <Button icon="edit" onClick={() => setRenaming(true)}>
          Rename
        </Button>
        <Button icon="move-to-folder" onClick={() => setMoving(true)} disabled={!d}>
          Move
        </Button>
        <Button
          icon="folder-open"
          onClick={() =>
            void api.revealModel(model.id).catch((e: Error) => toast(e.message, "error"))
          }
        >
          Reveal
        </Button>
        <Button
          icon="file-info"
          onClick={() => {
            setTarget({ type: "model", id: model.id, name: model.name });
            if (profileId)
              void navigate({
                to: "/p/$profileId/$view",
                params: { profileId, view: "file-info" },
              });
          }}
        >
          File info
        </Button>
      </div>
      <RenameDialog model={model} open={renaming} onOpenChange={setRenaming} onDone={onMoved} />
      {d ? (
        <MoveDialog
          model={model}
          details={d}
          open={moving}
          onOpenChange={setMoving}
          onDone={onMoved}
        />
      ) : null}
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
  details,
  open,
  onOpenChange,
  onDone,
}: {
  model: LocalModel;
  details: ModelDetails;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: (m: LocalModel) => void;
}) {
  const [folder, setFolder] = useState<string | null>(null);
  const move = useMoveModel();
  const value = folder ?? model.folder;
  const kindFolder = model.id.split("/")[0] ?? "";
  const options = useMemo(
    () => [
      { value: "", label: `${kindFolder}/ (top level)`, icon: "folder" as IconName },
      ...details.folders.map((f) => ({ value: f, label: f, icon: "folder" as IconName })),
    ],
    [details.folders, kindFolder],
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
