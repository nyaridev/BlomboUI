/**
 * Model pickers beside Generation: checkpoints (or diffusion models), LoRAs, wildcards and other
 * model kinds, listed from ComfyUI and the profile's wildcards folder. Picking sets the
 * workflow's model, adds a <lora:…> tag or a __wildcard__ to the prompt. The grid is virtualized:
 * LoRA folders often hold thousands of files. Thumbnails, base models and NSFW flags come from
 * the models folder (each model's picture and info) and the Civitai lookup (Models → Local's
 * list). Favorites come first, then what you used recently (the job log), unless another sort
 * is picked. A folder tree on the left narrows the grid to one folder; the top bar searches,
 * filters by base model, sorts and rescans.
 */
import { Icon } from "@client/icons/Icon";
import { useElementWidth } from "@client/lib/hooks";
import {
  useLocalModels,
  useModelMarks,
  useModels,
  useSetModelFavorite,
  useSettings,
  useWildcards,
} from "@client/lib/queries";
import {
  type CardKind,
  IconButton,
  type MenuEntry,
  ModelCard,
  openContextMenu,
  Segmented,
  Select,
  Spinner,
  TextField,
  toast,
} from "@client/ui";
import type { ModelKind } from "@shared/constants";
import type { LocalModel } from "@shared/models";
import { findLoraTags, formatLoraTag, swapLoraTag } from "@shared/prompt/loras";
import type { Binding } from "@shared/workflow/manifest";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { rescanModels } from "../../app/commands";
import { openModelInfo, useModelMenu } from "../models/actions";
import type { StripTarget } from "./blocks/ModelsStrip";
import { FolderTree } from "./FolderTree";
import { folderTree, inFolder } from "./folders";
import { modelDisplayName, modelFolder } from "./labels";
import { pickerOrder } from "./pickerOrder";
import { useValues } from "./state";
import { useBindings } from "./workflow";

export type PickerTab = "checkpoints" | "loras" | "wildcards" | "other";

const OTHER_KINDS: Array<{ value: ModelKind; label: string }> = [
  { value: "vae", label: "VAE" },
  { value: "text_encoders", label: "Text encoders" },
  { value: "upscale_models", label: "Upscalers" },
  { value: "controlnet", label: "ControlNet" },
  { value: "embeddings", label: "Embeddings" },
];

/** Cards are 256 x 384 (2:3); the row keeps what's left over (narrower only on small screens). */
const CARD_W = 256;
const CARD_RATIO = 2 / 3;
const GAP = 12;

type Sort = "suggested" | "name" | "newest" | "largest";
const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "suggested", label: "Favorites first" },
  { value: "name", label: "Name" },
  { value: "newest", label: "Newest files" },
  { value: "largest", label: "Largest first" },
];

interface Item {
  id: string;
  name: string;
  kind: CardKind;
  folder: string | null;
  local?: LocalModel;
}

/** "kind:style/foo.safetensors" (lowercase, forward slashes) for joining ComfyUI's names. */
const joinKey = (kind: string, rel: string) => `${kind}:${rel.replace(/\\/g, "/").toLowerCase()}`;

/** Without an extension, as LoRA tags are usually written. */
const tagName = (file: string) =>
  file.replace(/\\/g, "/").replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, "");

export function ModelGrid({
  tab,
  onDone,
  target,
  onTarget,
}: {
  tab: PickerTab;
  onDone: () => void;
  /** The strip's tile a pick changes (null: a pick adds, or sets the tab's first model). */
  target: StripTarget | null;
  onTarget: (target: StripTarget | null) => void;
}) {
  const bindings = useBindings();
  const [pickedKind, setPickedKind] = useState<ModelKind>("vae");
  const main =
    bindings.find((b) => b.role === "model.checkpoint") ??
    bindings.find((b) => b.role === "model.unet");
  const positive = bindings.find((b) => b.role === "prompt.positive");
  const targetBinding =
    target?.kind === "binding" ? bindings.find((b) => b.id === target.id) : undefined;
  // Other opens on the clicked tile's kind (a VAE, a text encoder…).
  const otherKind: ModelKind = (tab === "other" && targetBinding?.modelKind) || pickedKind;

  const kind: ModelKind | null =
    tab === "checkpoints"
      ? (main?.modelKind ?? "checkpoints")
      : tab === "loras"
        ? "loras"
        : tab === "other"
          ? otherKind
          : null;
  const models = useModels(kind);
  const wildcards = useWildcards();
  const localList = useLocalModels().data;
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  // ComfyUI lists names inside each kind folder; the local list has the same files with
  // thumbnails and info. Join them on the path below the kind folder.
  const local = useMemo(() => {
    const map = new Map<string, LocalModel>();
    for (const m of localList?.models ?? [])
      map.set(joinKey(m.kind, m.id.split("/").slice(1).join("/")), m);
    return map;
  }, [localList]);

  // Which binding a pick sets (models), or how it edits the prompt (LoRAs, wildcards, embeddings).
  // Two loaders can share a kind (two text encoders): the clicked one wins.
  const setsBinding: Binding | undefined =
    tab === "checkpoints"
      ? main
      : tab === "other"
        ? targetBinding?.modelKind === otherKind
          ? targetBinding
          : bindings.find((b) => b.type === "model" && b.modelKind === otherKind)
        : undefined;
  const selectedValue = useValues((s) => (setsBinding ? s.values[setsBinding.id] : undefined));
  const prompt = useValues((s) => (positive ? String(s.values[positive.id] ?? "") : ""));
  const setValue = useValues((s) => s.setValue);

  const items: Item[] = useMemo(() => {
    if (tab === "wildcards")
      return (wildcards.data?.names ?? []).map((n) => ({
        id: n,
        name: n,
        kind: "wildcards",
        folder: modelFolder(n),
      }));
    return (models.data?.names ?? []).map((n) => ({
      id: n,
      name: modelDisplayName(n),
      kind: (kind ?? "checkpoints") as CardKind,
      folder: modelFolder(n),
      local: kind ? local.get(joinKey(kind, n)) : undefined,
    }));
  }, [tab, models.data, wildcards.data, kind, local]);

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const [folder, setFolder] = useState<string | null>(null);
  const [base, setBase] = useState("");
  const [sort, setSort] = useState<Sort>("suggested");
  const [showTree, setShowTree] = useState(true);
  // Another tab or model kind has other folders and base models.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tab and kind are the triggers
  useEffect(() => {
    setFolder(null);
    setBase("");
  }, [tab, kind]);
  const marks = useModelMarks().data;
  const setFavorite = useSetModelFavorite();
  const favorites = useMemo(() => {
    const prefix = `${kind ?? "wildcards"}/`;
    return new Set(
      (marks?.favorites ?? [])
        .filter((f) => f.startsWith(prefix))
        .map((f) => f.slice(prefix.length)),
    );
  }, [marks, kind]);
  const bases = useMemo(
    () =>
      [
        ...new Set(items.map((i) => i.local?.baseModel).filter((b): b is string => Boolean(b))),
      ].sort(),
    [items],
  );
  // Search and base model first; the tree counts what they leave, the folder narrows further.
  const found = useMemo(
    () =>
      items.filter(
        (i) => (!q || i.id.toLowerCase().includes(q)) && (!base || i.local?.baseModel === base),
      ),
    [items, q, base],
  );
  const tree = useMemo(() => folderTree(found.map((i) => i.id)), [found]);
  const list = useMemo(() => {
    const shown = found.filter((i) => inFolder(i.id, folder));
    if (sort === "name") return shown.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "newest")
      return shown.sort((a, b) => (b.local?.mtime ?? 0) - (a.local?.mtime ?? 0));
    if (sort === "largest")
      return shown.sort((a, b) => (b.local?.size ?? 0) - (a.local?.size ?? 0));
    if (tab === "wildcards") return shown;
    return pickerOrder(shown, (i) => i.id, favorites, marks?.recent ?? []).map((o) => o.item);
  }, [found, folder, sort, tab, favorites, marks]);
  const inPrompt = useMemo(
    () => new Set(findLoraTags(prompt).map((t) => t.name.toLowerCase())),
    [prompt],
  );

  const isSelected = (item: Item) => {
    if (tab === "loras")
      return inPrompt.has(tagName(item.id).toLowerCase()) || inPrompt.has(item.name.toLowerCase());
    if (tab === "wildcards") return prompt.includes(`__${item.id}__`);
    return selectedValue === item.id;
  };

  const append = (text: string) => {
    if (!positive) {
      toast("This workflow has no prompt to add that to.", "warning");
      return;
    }
    const base = prompt.trimEnd();
    setValue(positive.id, base ? `${base}${base.endsWith(",") ? " " : ", "}${text}` : text);
  };

  const pick = (item: Item) => {
    const swapTag =
      tab === "loras" && target?.kind === "lora" ? findLoraTags(prompt)[target.index] : undefined;
    const swapWildcard =
      tab === "wildcards" && target?.kind === "wildcard" && target.name
        ? `__${target.name}__`
        : null;
    if (tab === "loras") {
      if (isSelected(item)) return;
      if (swapTag && positive) {
        setValue(
          positive.id,
          swapLoraTag(prompt, swapTag, tagName(item.id), item.local?.weight ?? swapTag.strength),
        );
        return;
      }
      append(formatLoraTag(tagName(item.id), item.local?.weight ?? 1));
    } else if (tab === "wildcards") {
      if (swapWildcard && positive && prompt.includes(swapWildcard)) {
        if (swapWildcard === `__${item.id}__`) return;
        setValue(
          positive.id,
          prompt.replace(swapWildcard, () => `__${item.id}__`),
        );
        onTarget({ kind: "wildcard", name: item.id });
        return;
      }
      append(`__${item.id}__`);
    } else if (tab === "other" && otherKind === "embeddings") {
      append(`embedding:${tagName(item.id)}`);
    } else if (setsBinding) {
      setValue(setsBinding.id, item.id);
      onDone();
    } else {
      toast("This workflow doesn't use that kind of model.", "info");
    }
  };

  // Right-click: use it, then what any local model offers (info, favorite, Explorer…).
  const modelMenu = useModelMenu();
  const menuFor = (item: Item): MenuEntry[] => {
    const adds =
      tab === "loras" || tab === "wildcards" || (tab === "other" && otherKind === "embeddings");
    const use: MenuEntry = {
      id: "use",
      label: adds ? "Add to prompt" : "Use this model",
      icon: adds ? "plus" : "check",
      disabled: isSelected(item) && tab !== "wildcards",
      onSelect: () => pick(item),
    };
    if (item.local) return modelMenu(item.local, { first: [use, { type: "separator", id: "s0" }] });
    return [
      use,
      {
        id: "copy",
        label: "Copy name",
        icon: "copy",
        onSelect: () =>
          void navigator.clipboard
            ?.writeText(item.id)
            .then(() => toast(`Copied "${item.id}"`, "success")),
      },
    ];
  };

  const loading = tab === "wildcards" ? wildcards.isLoading : models.isLoading;
  const unavailable = tab !== "wildcards" && models.data && !models.data.available;

  return (
    // The Generate view scrolls as a whole, so the grid gets a height of its own.
    <div className="flex h-[75svh] min-h-[420px] flex-col gap-3 pt-3">
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
          placeholder={`Search ${tab === "other" ? OTHER_KINDS.find((k) => k.value === otherKind)?.label.toLowerCase() : tab}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          className="min-w-0 flex-1"
        />
        {tab === "other" ? (
          <Segmented
            size="sm"
            value={otherKind}
            onChange={(k) => {
              setPickedKind(k);
              onTarget(null);
            }}
            label="Model kind"
            options={OTHER_KINDS}
          />
        ) : null}
        {bases.length ? (
          <Select
            value={base}
            onChange={setBase}
            label="Base model"
            className="w-44"
            options={[
              { value: "", label: "All base models" },
              ...bases.map((b) => ({ value: b, label: b })),
            ]}
          />
        ) : null}
        <Select<Sort>
          value={sort}
          onChange={setSort}
          label="Sort"
          className="w-40"
          options={tab === "wildcards" ? SORTS.slice(0, 2) : SORTS}
        />
        {tab !== "wildcards" ? (
          <IconButton
            icon="rescan-models"
            label="Rescan model folders"
            variant="secondary"
            onClick={() => void rescanModels()}
          />
        ) : null}
        <span className="text-xs whitespace-nowrap text-fg-3 tabular">
          {list.length} {list.length === 1 ? "item" : "items"}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        {showTree && !loading && !unavailable ? (
          <FolderTree nodes={tree} total={found.length} folder={folder} onFolder={setFolder} />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          {loading ? (
            <div className="grid flex-1 place-items-center text-fg-3">
              <Spinner size={20} />
            </div>
          ) : unavailable ? (
            <Empty
              icon="workflow"
              text="Start ComfyUI to see your models. It lists what's in the profile's models folder."
            />
          ) : tab === "wildcards" && !wildcards.data?.root ? (
            <Empty
              icon="wildcards"
              text="This profile has no wildcards folder. Set one in Settings to use __wildcards__."
            />
          ) : list.length === 0 ? (
            <Empty
              icon="search"
              text={
                q
                  ? `Nothing matches "${query}" here.`
                  : base || folder
                    ? "Nothing here with these filters."
                    : "Nothing here yet. Add files to the folder, then rescan models from the header."
              }
            />
          ) : (
            <VirtualGrid
              items={list}
              isSelected={isSelected}
              onPick={pick}
              onMenu={(e, item) => openContextMenu(e, menuFor(item))}
              blurNsfw={blurNsfw}
              favorites={tab === "wildcards" ? null : favorites}
              onFavorite={(item) =>
                kind &&
                setFavorite.mutate({ kind, name: item.id, favorite: !favorites.has(item.id) })
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ icon, text }: { icon: "workflow" | "wildcards" | "search"; text: string }) {
  return (
    <div className="grid flex-1 place-items-center">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center text-sm text-fg-3">
        <Icon name={icon} size={22} />
        {text}
      </div>
    </div>
  );
}

function VirtualGrid({
  items,
  isSelected,
  onPick,
  onMenu,
  blurNsfw,
  favorites,
  onFavorite,
}: {
  items: Item[];
  isSelected: (i: Item) => boolean;
  onPick: (i: Item) => void;
  onMenu: (e: MouseEvent<HTMLElement>, i: Item) => void;
  blurNsfw: boolean;
  /** Null where favorites don't apply (wildcards). */
  favorites: Set<string> | null;
  onFavorite: (i: Item) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const width = useElementWidth(scroller);
  const columns = Math.max(1, Math.floor((width + GAP) / (CARD_W + GAP)));
  const cardWidth = width > 0 ? Math.min(CARD_W, width) : CARD_W;
  const rowHeight = Math.round(cardWidth / CARD_RATIO) + GAP;
  const rows = Math.ceil(items.length / columns);
  const virtual = useVirtualizer({
    count: rows,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  });
  // Row height follows the column width; re-measure when it changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rowHeight is the trigger, not an input
  useEffect(() => {
    virtual.measure();
  }, [rowHeight, virtual]);

  return (
    <div ref={scroller} className="scroll-quiet min-h-0 flex-1 overflow-auto pr-1">
      <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
        {virtual.getVirtualItems().map((row) => (
          <div
            key={`${row.key}-${columns}`}
            className="absolute inset-x-0 grid"
            style={{
              top: row.start,
              gridTemplateColumns: `repeat(${columns}, ${cardWidth}px)`,
              gap: GAP,
            }}
          >
            {items.slice(row.index * columns, row.index * columns + columns).map((item) => (
              <PickerCard
                key={item.id}
                item={item}
                blurNsfw={blurNsfw}
                selected={isSelected(item)}
                onPick={onPick}
                onMenu={onMenu}
                favorite={favorites ? favorites.has(item.id) : null}
                onFavorite={onFavorite}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PickerCard({
  item,
  blurNsfw,
  selected,
  onPick,
  onMenu,
  favorite,
  onFavorite,
}: {
  item: Item;
  blurNsfw: boolean;
  selected: boolean;
  onPick: (i: Item) => void;
  onMenu: (e: MouseEvent<HTMLElement>, i: Item) => void;
  favorite: boolean | null;
  onFavorite: (i: Item) => void;
}) {
  // Only files in the models folder have info to show (wildcards and ComfyUI-only names don't).
  const localId = item.local?.id;
  return (
    <ModelCard
      name={item.name}
      kind={item.kind}
      baseModel={item.local?.baseModel ?? item.folder ?? undefined}
      thumb={item.local?.thumb ?? null}
      nsfw={item.local?.nsfw}
      blurNsfw={blurNsfw}
      meta={item.local?.triggerWords[0]}
      ratio={CARD_RATIO}
      selected={selected}
      onClick={() => onPick(item)}
      onContextMenu={(e) => onMenu(e, item)}
      favorite={favorite ?? undefined}
      onFavorite={favorite === null ? undefined : () => onFavorite(item)}
      onInfo={localId ? () => openModelInfo(localId) : undefined}
    />
  );
}
