/**
 * Scopes (avatar menu, and a tab in Models): pictures of models per context. The rail lists the
 * scopes by group; the selected one shows every model with its picture there, to upload, take
 * from the gallery, remove, or make in bulk with the Scripts block's "Scope thumbnails". Lookup
 * shows one model's pictures in every scope. The top bar picks what cards everywhere show: one
 * scope, or the one the Generate prompt's tags pick (auto).
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useElementWidth, useGoToView } from "@client/lib/hooks";
import { qk, useGalleryImages, useLocalModels, useScopes, useSettings } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  ModelCard,
  Panel,
  Segmented,
  Select,
  Skeleton,
  Switch,
  TextField,
  Tooltip,
  toast,
} from "@client/ui";
import type { ModelKind } from "@shared/constants";
import type { LocalModel } from "@shared/models";
import { comfyNameOf, DEFAULT_SCOPE, type ScopeDef, scopeKey } from "@shared/scopes";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { useScript } from "../generate/scripts";
import { useEffectiveScope } from "./thumbs";

const KINDS: Array<{ value: ModelKind; label: string }> = [
  { value: "checkpoints", label: "Checkpoints" },
  { value: "loras", label: "LoRAs" },
  { value: "diffusion_models", label: "Diffusion" },
  { value: "embeddings", label: "Embeddings" },
];

const MIN_CARD = 168;
const GAP = 12;

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function ScopesView({ embedded }: { embedded?: boolean }) {
  const scopes = useScopes();
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const [selected, setSelected] = useState<string>(DEFAULT_SCOPE);
  const [editing, setEditing] = useState<ScopeDef | "new" | null>(null);
  const [mode, setMode] = useState<"pictures" | "lookup">("pictures");
  const data = scopes.data;
  const scope = data?.scopes.find((s) => s.id === selected) ?? data?.scopes[0];

  const refresh = () => qc.invalidateQueries({ queryKey: qk.scopes(profileId) });
  const setOptions = async (patch: { active?: string; auto?: boolean }) => {
    try {
      qc.setQueryData(qk.scopes(profileId), await api.setScopeOptions(patch));
    } catch (e) {
      toast(message(e), "error");
    }
  };

  const groups = useMemo(() => {
    const out = new Map<string, ScopeDef[]>();
    for (const s of data?.scopes ?? []) out.set(s.group, [...(out.get(s.group) ?? []), s]);
    return [...out.entries()].sort(([a], [b]) =>
      a === "" ? -1 : b === "" ? 1 : a.localeCompare(b),
    );
  }, [data]);

  if (scopes.isLoading)
    return (
      <div className="flex flex-col gap-3 p-8">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (scopes.error || !data || !scope)
    return (
      <EmptyState
        icon="errors"
        tone="warning"
        title="Couldn't read the scopes"
        text={scopes.error?.message ?? "Open a profile first."}
        action={<Button onClick={() => void scopes.refetch()}>Try again</Button>}
      />
    );

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex flex-wrap items-end gap-x-6 gap-y-3 px-8",
          embedded ? "pt-4 pb-3" : "pt-8 pb-4",
        )}
      >
        {embedded ? null : (
          <div className="flex min-w-[280px] flex-1 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">Scopes</h1>
            <p className="text-sm text-fg-3">
              A picture of each model per context, so cards show how a LoRA looks in the style
              you're working in. Pictures stay in the profile; the models folder isn't touched.
            </p>
          </div>
        )}
        <ShowingBar
          scopes={data.scopes}
          active={data.active}
          auto={data.auto}
          onActive={(active) => void setOptions({ active })}
          onAuto={(auto) => void setOptions({ auto })}
        />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)] border-t border-line">
        <aside className="scroll-quiet flex flex-col gap-0.5 overflow-y-auto border-r border-line bg-surface px-2 py-3">
          {groups.map(([group, list]) => (
            <div key={group || "_"} className="flex flex-col gap-0.5">
              {group ? (
                <div className="label-caps px-2.5 pt-3 pb-1 text-[10px]">{group}</div>
              ) : null}
              {list.map((s) => {
                const count = Object.keys(data.thumbs[s.id] ?? {}).length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected(s.id)}
                    aria-current={scope.id === s.id ? "true" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors focus-ring",
                      scope.id === s.id
                        ? "bg-field text-fg ring-1 ring-line-strong"
                        : "text-fg-2 hover:bg-field",
                    )}
                  >
                    <Icon
                      name="scopes"
                      size={15}
                      className={scope.id === s.id ? "text-accent-ink" : "text-fg-3"}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {data.active === s.id ? (
                      <Tooltip content="Cards show this scope">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      </Tooltip>
                    ) : null}
                    <span className="font-mono text-2xs text-fg-4 tabular">{count}</span>
                  </button>
                );
              })}
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            icon="plus"
            className="mt-3 justify-start"
            onClick={() => setEditing("new")}
          >
            New scope
          </Button>
        </aside>
        <section className="flex min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 text-base font-semibold text-fg">
                {scope.name}
                {scope.group ? <Badge>{scope.group}</Badge> : null}
              </span>
              <span className="truncate text-xs text-fg-3">
                {scope.tags.length
                  ? `Picked by: ${scope.tags.join(", ")}`
                  : scope.id === DEFAULT_SCOPE
                    ? "Shown for models without a preview of their own."
                    : "No prompt tags yet: auto won't pick it."}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "pictures", label: "Pictures", icon: "image" },
                  { value: "lookup", label: "Lookup", icon: "search" },
                ]}
              />
              <IconButton icon="edit" label="Edit this scope" onClick={() => setEditing(scope)} />
            </div>
          </div>
          {mode === "pictures" ? (
            <ScopePictures scope={scope} thumbs={data.thumbs[scope.id] ?? {}} onChanged={refresh} />
          ) : (
            <Lookup scopes={data.scopes} thumbs={data.thumbs} />
          )}
        </section>
      </div>
      <ScopeDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(s) => {
          setSelected(s.id);
          void refresh();
        }}
        onRemoved={() => {
          setSelected(DEFAULT_SCOPE);
          void refresh();
        }}
      />
    </div>
  );
}

function ShowingBar({
  scopes,
  active,
  auto,
  onActive,
  onAuto,
}: {
  scopes: ScopeDef[];
  active: string;
  auto: boolean;
  onActive: (id: string) => void;
  onAuto: (on: boolean) => void;
}) {
  const effective = useEffectiveScope((s) => s.id);
  const matched = useEffectiveScope((s) => s.matched);
  const name = (id: string) => scopes.find((s) => s.id === id)?.name ?? id;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-fg-2">Cards show</span>
      <Select
        size="sm"
        className="w-44"
        label="Scope cards show"
        value={active}
        onChange={onActive}
        options={scopes.map((s) => ({ value: s.id, label: s.name, group: s.group || undefined }))}
      />
      <label className="flex items-center gap-2 text-sm text-fg-2">
        <Switch checked={auto} onCheckedChange={onAuto} label="Pick from the prompt" />
        Pick from the prompt
      </label>
      {auto ? (
        <span className="text-xs text-fg-3">
          {matched.length
            ? `Now: ${name(effective)} (from ${matched.join(", ")})`
            : `Now: ${name(effective)} (no scope's tags are in the prompt)`}
        </span>
      ) : null}
    </div>
  );
}

/* ── one scope's pictures ─────────────────────────────────────────────── */

function ScopePictures({
  scope,
  thumbs,
  onChanged,
}: {
  scope: ScopeDef;
  thumbs: Record<string, string>;
  onChanged: () => void;
}) {
  const local = useLocalModels();
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  const go = useGoToView();
  const [kind, setKind] = useState<ModelKind>("loras");
  const [query, setQuery] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [fromGallery, setFromGallery] = useState<LocalModel | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<LocalModel | null>(null);

  const models = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (local.data?.models ?? []).filter(
      (m) =>
        m.kind === kind &&
        (!q || m.name.toLowerCase().includes(q) || m.file.toLowerCase().includes(q)) &&
        (!missingOnly || !thumbs[scopeKey(m.kind, comfyNameOf(m))]),
    );
  }, [local.data, kind, query, missingOnly, thumbs]);
  const withPicture = (local.data?.models ?? []).filter(
    (m) => m.kind === kind && thumbs[scopeKey(m.kind, comfyNameOf(m))],
  ).length;
  const total = (local.data?.models ?? []).filter((m) => m.kind === kind).length;

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast(done, "success");
      onChanged();
    } catch (e) {
      toast(message(e), "error");
    }
  };

  const makeWithScript = () => {
    const missing = (local.data?.models ?? [])
      .filter((m) => m.kind === kind && !thumbs[scopeKey(m.kind, comfyNameOf(m))])
      .map(comfyNameOf)
      .slice(0, 100);
    useScript.getState().set({
      kind: "thumbs",
      thumbs: {
        target: kind === "loras" ? "lora" : "model",
        models: missing,
        scope: scope.id,
        loraWeight: 1,
      },
    });
    toast(
      `The Scripts block on Generate is set to make ${missing.length} picture${missing.length === 1 ? "" : "s"} in “${scope.name}”. Check the prompt, then Run script.`,
      "info",
    );
    go("generate");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={kind} onChange={setKind} label="Model kind" options={KINDS} />
        <TextField
          icon="search"
          size="sm"
          placeholder="Search models"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          className="w-60"
        />
        <label className="flex items-center gap-2 text-xs text-fg-2">
          <Switch
            size="sm"
            checked={missingOnly}
            onCheckedChange={setMissingOnly}
            label="Only without a picture"
          />
          Only without a picture
        </label>
        <span className="ml-auto text-xs text-fg-3 tabular">
          {withPicture} of {total} have a picture here
        </span>
        {kind === "loras" || kind === "checkpoints" ? (
          <Button
            size="sm"
            icon="layout-grid"
            disabled={withPicture === total}
            onClick={makeWithScript}
          >
            Make the missing ones
          </Button>
        ) : null}
      </div>
      <input
        ref={upload}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const m = uploadFor.current;
          e.target.value = "";
          if (!file || !m) return;
          void run(
            () => api.uploadScopeThumb(scope.id, m.kind, comfyNameOf(m), file),
            `Picture saved for ${m.name}`,
          );
        }}
      />
      {local.isLoading ? (
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : !models.length ? (
        <EmptyState
          icon="models"
          title={
            total
              ? "Nothing matches"
              : `No ${KINDS.find((k) => k.value === kind)?.label.toLowerCase()} in your models folder`
          }
          text={
            total
              ? "Try another search, or turn off “Only without a picture”."
              : "Add models to the folder (or download them in Models), then rescan."
          }
        />
      ) : (
        <PictureGrid
          models={models}
          thumbs={thumbs}
          blurNsfw={blurNsfw}
          onUpload={(m) => {
            uploadFor.current = m;
            upload.current?.click();
          }}
          onGallery={setFromGallery}
          onRemove={(m) =>
            void run(
              () => api.removeScopeThumb(scope.id, m.kind, comfyNameOf(m)),
              `Moved the picture of ${m.name} to the trash`,
            )
          }
        />
      )}
      <GalleryPick
        model={fromGallery}
        onClose={() => setFromGallery(null)}
        onPick={(imageId) => {
          const m = fromGallery;
          setFromGallery(null);
          if (m)
            void run(
              () => api.scopeThumbFromImage(scope.id, m.kind, comfyNameOf(m), imageId),
              `Picture saved for ${m.name}`,
            );
        }}
      />
    </div>
  );
}

function PictureGrid({
  models,
  thumbs,
  blurNsfw,
  onUpload,
  onGallery,
  onRemove,
}: {
  models: LocalModel[];
  thumbs: Record<string, string>;
  blurNsfw: boolean;
  onUpload: (m: LocalModel) => void;
  onGallery: (m: LocalModel) => void;
  onRemove: (m: LocalModel) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(innerRef);
  const cols = Math.max(1, Math.floor((width + GAP) / (MIN_CARD + GAP)));
  const cardW = width > 0 ? (width - GAP * (cols - 1)) / cols : MIN_CARD;
  const rowH = Math.round((cardW * 4) / 3) + 40 + GAP;
  const virtualizer = useVirtualizer({
    count: Math.ceil(models.length / cols),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowH,
    overscan: 3,
  });
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
            {models.slice(v.index * cols, v.index * cols + cols).map((m) => {
              const pic = thumbs[scopeKey(m.kind, comfyNameOf(m))] ?? null;
              return (
                <ModelCard
                  key={m.id}
                  name={m.name}
                  kind={m.kind}
                  baseModel={m.baseModel ?? undefined}
                  thumb={pic}
                  nsfw={false}
                  blurNsfw={blurNsfw}
                  meta={pic ? undefined : "No picture in this scope"}
                  onClick={() => onUpload(m)}
                  footer={
                    <div className="flex items-center gap-0.5 border-t border-line px-1.5 py-1">
                      <IconButton
                        icon="upload"
                        size="xs"
                        label="Upload a picture"
                        onClick={() => onUpload(m)}
                      />
                      <IconButton
                        icon="gallery"
                        size="xs"
                        label="Pick from the gallery"
                        onClick={() => onGallery(m)}
                      />
                      <IconButton
                        icon="trash"
                        size="xs"
                        label="Remove this picture"
                        disabled={!pic}
                        className="ml-auto"
                        onClick={() => onRemove(m)}
                      />
                    </div>
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pick a gallery image to become a model's picture. */
function GalleryPick({
  model,
  onClose,
  onPick,
}: {
  model: LocalModel | null;
  onClose: () => void;
  onPick: (imageId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const images = useGalleryImages({ library: "all", q: query.trim() || undefined, limit: 120 });
  const items = images.data?.pages.flatMap((p) => p.items).slice(0, 120) ?? [];
  return (
    <Dialog
      open={model !== null}
      onOpenChange={(o) => !o && onClose()}
      title={`A picture for ${model?.name ?? ""}`}
      description="Pick an image from the gallery. It's shrunk to a 512 px thumbnail; the image itself stays where it is."
      width={760}
    >
      <div className="flex flex-col gap-3">
        <TextField
          icon="search"
          placeholder="Search prompts and file names"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
        />
        {images.isLoading ? (
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-3">
            {query ? "No image matches." : "The gallery is empty. Generate something first."}
          </p>
        ) : (
          <div className="grid grid-cols-5 gap-2">
            {items.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => onPick(img.id)}
                className="group relative aspect-square overflow-hidden rounded-md border border-line bg-sunken focus-ring"
                aria-label={`Use ${img.name}`}
              >
                <img
                  src={img.thumb}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ── lookup: one model in every scope ─────────────────────────────────── */

function Lookup({
  scopes,
  thumbs,
}: {
  scopes: ScopeDef[];
  thumbs: Record<string, Record<string, string>>;
}) {
  const local = useLocalModels();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      q
        ? (local.data?.models ?? [])
            .filter((m) => m.name.toLowerCase().includes(q) || m.file.toLowerCase().includes(q))
            .slice(0, 40)
        : [],
    [local.data, q],
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pt-3">
      <TextField
        icon="search"
        placeholder="Find a model to see its picture in every scope"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onClear={() => setQuery("")}
        className="w-96"
        autoFocus
      />
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto pb-5">
        {!q ? (
          <EmptyState
            icon="search"
            title="Look a model up"
            text="Type part of a model's name. Each row shows its picture in every scope, so you can see which ones are still missing."
          />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-3">No model matches “{query}”.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((m) => (
              <Panel key={m.id} className="flex items-center gap-4 p-3">
                <div className="flex w-56 min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-fg">{m.name}</span>
                  <span className="truncate font-mono text-2xs text-fg-3">{comfyNameOf(m)}</span>
                </div>
                <div className="scroll-quiet flex flex-1 gap-2 overflow-x-auto">
                  {scopes.map((s) => {
                    const pic = thumbs[s.id]?.[scopeKey(m.kind, comfyNameOf(m))];
                    return (
                      <div key={s.id} className="flex w-20 shrink-0 flex-col gap-1">
                        <div className="aspect-[3/4] overflow-hidden rounded-md border border-line bg-sunken">
                          {pic ? (
                            <img
                              src={pic}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : s.id === DEFAULT_SCOPE && m.thumb ? (
                            <img
                              src={m.thumb}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover opacity-70"
                            />
                          ) : (
                            <span className="grid h-full place-items-center text-fg-4">
                              <Icon name="minus" size={14} />
                            </span>
                          )}
                        </div>
                        <span className="truncate text-center text-2xs text-fg-3">{s.name}</span>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── create / edit ─────────────────────────────────────────────────────── */

function ScopeDialog({
  editing,
  onClose,
  onSaved,
  onRemoved,
}: {
  editing: ScopeDef | "new" | null;
  onClose: () => void;
  onSaved: (s: ScopeDef) => void;
  onRemoved: () => void;
}) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [armRemove, setArmRemove] = useState(false);
  const isNew = editing === "new";
  const current = editing && editing !== "new" ? editing : null;

  useEffect(() => {
    setName(current?.name ?? "");
    setGroup(current?.group ?? "");
    setTags(current?.tags.join(", ") ?? "");
    setArmRemove(false);
  }, [current]);

  const tagList = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const body = { name: name.trim(), group: group.trim(), tags: tagList };
      const saved = current ? await api.updateScope(current.id, body) : await api.createScope(body);
      toast(current ? "Scope saved" : `Scope “${saved.name}” added`, "success");
      onSaved(saved);
      onClose();
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!current) return;
    if (!armRemove) return setArmRemove(true);
    setBusy(true);
    try {
      await api.removeScope(current.id);
      toast(`Removed “${current.name}”; its pictures are in the profile's trash`, "success");
      onRemoved();
      onClose();
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? "New scope" : `Edit “${current?.name ?? ""}”`}
      description="A context with its own picture for each model, like a style or a character."
      footer={
        <>
          {current && current.id !== DEFAULT_SCOPE ? (
            <Button
              variant="danger"
              icon="trash"
              className="mr-auto"
              disabled={busy}
              onClick={() => void remove()}
            >
              {armRemove ? "Click again to remove" : "Remove scope"}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
            onClick={() => void save()}
          >
            {isNew ? "Add scope" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <TextField
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Anime"
            autoFocus
          />
        </Field>
        <Field
          label="Group"
          hint="Scopes with the same group are listed together (Styles, Characters…)."
        >
          <TextField
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="Styles"
          />
        </Field>
        <Field
          label="Prompt tags that pick it"
          hint="Comma separated. With “Pick from the prompt” on, the scope with the most of these tags in the Generate prompt is shown."
        >
          <TextField
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="anime, cel shading, 1girl"
          />
        </Field>
        {tagList.length ? (
          <div className="flex flex-wrap gap-1.5">
            {tagList.map((t) => (
              <Badge key={t} tone="accent">
                {t}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
