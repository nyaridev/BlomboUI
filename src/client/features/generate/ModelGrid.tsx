/**
 * Model pickers beside Generation: checkpoints (or diffusion models), LoRAs, wildcards and other
 * model kinds, listed from ComfyUI and the profile's wildcards folder. Picking sets the
 * workflow's model, adds a LoRA (instant: beside the prompt, its trigger words added when
 * generating; with Instant off in its model info, a <lora:…> tag and its trigger words in the
 * prompt; clicking a LoRA in use takes it off again) or adds a __wildcard__ to the prompt. The
 * grid is virtualized: LoRA folders often hold thousands of files. Thumbnails, base models and NSFW flags come from
 * the models folder (each model's picture and info) and the Civitai lookup (Models → Local's
 * list). Favorites come first, then what you used recently (the job log), unless another sort
 * is picked (name, path, created, modified, size; the square button beside it flips the order).
 * Newest files come first by default. A folder tree on the left narrows the grid to one folder
 * (one top folder per profile models folder when files come from several); right-click a folder
 * or a card to rename it or show it in Explorer. Renames carry over to the open workflow and,
 * with the setting on, to full references in wildcard files (shared/prompt/renames.ts). The top
 * bar searches, filters by base models (several, grouped by maker), keeps what the workflow
 * uses first (the eye), sorts and rescans.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useElementWidth } from "@client/lib/hooks";
import {
  qk,
  useLocalModels,
  useModelMarks,
  useModels,
  useRenameModel,
  useSetModelFavorite,
  useSettings,
  useUpdateSettings,
  useWildcards,
} from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  type CardKind,
  IconButton,
  type MenuEntry,
  ModelCard,
  MultiSelect,
  openContextMenu,
  Segmented,
  Select,
  Spinner,
  TextField,
  toast,
} from "@client/ui";
import { groupBaseModels } from "@shared/basemodels";
import type { ModelKind } from "@shared/constants";
import type { LocalModel } from "@shared/models";
import { INSTANT_LORAS, type InstantLora, readInstantLoras } from "@shared/prompt/instant";
import {
  findLoraTags,
  formatLoraTag,
  removeLora,
  removeLoraTag,
  swapLoraTag,
} from "@shared/prompt/loras";
import { type RenameChange, renameName, renameRefs } from "@shared/prompt/renames";
import type { Binding } from "@shared/workflow/manifest";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { rescanModels } from "../../app/commands";
import { openModelInfo, useModelMenu } from "../models/actions";
import type { StripTarget } from "./blocks/ModelsStrip";
import { FolderTree } from "./FolderTree";
import { folderTree, inFolder } from "./folders";
import { modelDisplayName, modelFolder } from "./labels";
import { pickerOrder } from "./pickerOrder";
import { RenameDialog, type RenameTarget } from "./RenameDialog";
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

/**
 * Cards (2:3) fill the row: 5 a row beside the folders, 7 without them; fewer on narrow screens
 * so a card never gets thinner than MIN_CARD_W.
 */
const COLUMNS = { tree: 5, wide: 7 } as const;
const MIN_CARD_W = 150;
const CARD_RATIO = 2 / 3;
const GAP = 12;

type Sort = "suggested" | "name" | "created" | "modified" | "path" | "size";
type Order = "asc" | "desc";
/** Each sort with the order it starts in (dates and size newest / largest first). */
const SORTS: Array<{ value: Sort; label: string; order: Order; files?: true }> = [
  { value: "suggested", label: "Favorites first", order: "asc" },
  { value: "name", label: "Name", order: "asc" },
  { value: "path", label: "Path", order: "asc" },
  { value: "created", label: "Date created", order: "desc", files: true },
  { value: "modified", label: "Date modified", order: "desc", files: true },
  { value: "size", label: "Size", order: "desc", files: true },
];
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const COMPARE: Record<Exclude<Sort, "suggested">, (a: Item, b: Item) => number> = {
  name: (a, b) => byText(a.name, b.name),
  path: (a, b) => byText(a.id, b.id),
  created: (a, b) => (a.local?.ctime ?? 0) - (b.local?.ctime ?? 0),
  modified: (a, b) => (a.local?.mtime ?? 0) - (b.local?.mtime ?? 0),
  size: (a, b) => (a.local?.size ?? 0) - (b.local?.size ?? 0),
};

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
  const settings = useSettings().data;
  const updateSettings = useUpdateSettings();
  const blurNsfw = settings?.models.blurNsfw ?? true;
  const showLoaded = settings?.generate.pickerShowLoaded ?? true;
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
  const savedInstant = useValues((s) => s.values[INSTANT_LORAS]);
  const instant = useMemo(() => readInstantLoras(savedInstant), [savedInstant]);
  const setInstant = (list: InstantLora[]) => setValue(INSTANT_LORAS, list);

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
  const [baseModels, setBaseModels] = useState<string[]>([]);
  const [pickedSort, setSort] = useState<Sort>("created");
  const [order, setOrder] = useState<Order>("desc");
  // Wildcards have no file dates or sizes: those sorts read as Name there.
  const sort: Sort =
    tab === "wildcards" && SORTS.find((s) => s.value === pickedSort)?.files ? "name" : pickedSort;
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [showTree, setShowTree] = useState(true);
  // Another tab or model kind has other folders and base models.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tab and kind are the triggers
  useEffect(() => {
    setFolder(null);
    setBaseModels([]);
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
      groupBaseModels(items.map((i) => i.local?.baseModel).filter((b): b is string => Boolean(b))),
    [items],
  );
  const inPrompt = useMemo(
    () => new Set([...findLoraTags(prompt), ...instant].map((t) => t.name.toLowerCase())),
    [prompt, instant],
  );
  const isSelected = (item: Item) => {
    if (tab === "loras")
      return inPrompt.has(tagName(item.id).toLowerCase()) || inPrompt.has(item.name.toLowerCase());
    if (tab === "wildcards") return prompt.includes(`__${item.id}__`);
    return selectedValue === item.id;
  };
  // What the workflow uses (the eye keeps it first and past the search and base models).
  // biome-ignore lint/correctness/useExhaustiveDependencies: isSelected reads these
  const loaded = useMemo(
    () => new Set(showLoaded ? items.filter(isSelected).map((i) => i.id) : []),
    [showLoaded, items, inPrompt, prompt, selectedValue, tab],
  );

  // Files from several profile models folders: one top folder per models folder, by its name.
  const roots = localList?.folders ?? [];
  const multiRoot = new Set(items.map((i) => i.local?.root).filter(Boolean)).size > 1;
  const treeKey = (i: Item) => {
    const root = multiRoot && i.local ? roots.find((r) => r.id === i.local?.root) : undefined;
    return root ? `${root.name}/${i.id.replace(/\\/g, "/")}` : i.id;
  };
  /** A tree path back to its models folder (when grouped) and the path below the kind folder. */
  const fromTree = (path: string): { root?: string; folder: string } => {
    if (!multiRoot) return { folder: path };
    const root = roots.find((r) => path === r.name || path.startsWith(`${r.name}/`));
    return root ? { root: root.id, folder: path.slice(root.name.length + 1) } : { folder: path };
  };

  // Search and base models first; the tree counts what they leave, the folder narrows further.
  const found = useMemo(() => {
    const wanted = new Set(baseModels);
    return items.filter(
      (i) =>
        loaded.has(i.id) ||
        ((!q || i.id.toLowerCase().includes(q)) &&
          (!wanted.size || wanted.has(i.local?.baseModel ?? ""))),
    );
  }, [items, q, baseModels, loaded]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: treeKey follows multiRoot and roots
  const tree = useMemo(() => folderTree(found.map(treeKey)), [found, multiRoot, roots]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: treeKey follows multiRoot and roots
  const list = useMemo(() => {
    const shown = found.filter((i) => inFolder(treeKey(i), folder));
    let sorted: Item[];
    if (sort !== "suggested") {
      const compare = COMPARE[sort];
      sorted = shown.sort(order === "asc" ? compare : (a, b) => compare(b, a));
    } else {
      const suggested =
        tab === "wildcards"
          ? shown
          : pickerOrder(shown, (i) => i.id, favorites, marks?.recent ?? []).map((o) => o.item);
      sorted = order === "asc" ? suggested : suggested.reverse();
    }
    if (!loaded.size) return sorted;
    return [...sorted.filter((i) => loaded.has(i.id)), ...sorted.filter((i) => !loaded.has(i.id))];
  }, [found, folder, sort, order, tab, favorites, marks, loaded, multiRoot, roots]);
  const pickSort = (next: Sort) => {
    setSort(next);
    setOrder(SORTS.find((s) => s.value === next)?.order ?? "asc");
  };
  const openFolder = (path: string) => {
    const at = fromTree(path);
    void (
      kind ? api.openModelFolder(kind, at.folder, at.root) : api.openWildcardFolder(path)
    ).catch((e: Error) => toast(e.message, "error"));
  };

  /* ── renaming ── */
  const qc = useQueryClient();
  const renameModel = useRenameModel();
  // The open workflow follows a rename: model values, and (LoRAs, wildcards) prompts and
  // instant LoRAs.
  const carryOver = (c: RenameChange, modelKind: ModelKind | null, text: boolean) => {
    const values = useValues.getState().values;
    for (const b of bindings) {
      const v = values[b.id];
      if (typeof v !== "string") continue;
      const next =
        b.type === "model"
          ? b.modelKind === modelKind
            ? renameName(v, c)
            : null
          : text && b.role?.startsWith("prompt.")
            ? renameRefs(v, c)
            : null;
      if (next !== null && next !== v) setValue(b.id, next);
    }
    if (text && c.kind === "lora") {
      const next = instant.map((l) => ({ ...l, name: renameName(l.name, c, true) ?? l.name }));
      if (next.some((l, i) => l.name !== instant[i]?.name)) setInstant(next);
    }
  };
  /** `text`: a LoRA or wildcard, so prompts and wildcard files may name it. */
  const afterRename = async (c: RenameChange, modelKind: ModelKind | null, text: boolean) => {
    carryOver(c, modelKind, text);
    if (text && settings?.generate.renameRefs !== false) {
      const { files } = await api.renameRefs([c]);
      if (files) toast(`Updated ${files} wildcard file${files === 1 ? "" : "s"}`, "success");
    }
    void qc.invalidateQueries({ queryKey: ["local-models"] });
    void qc.invalidateQueries({ queryKey: qk.modelsAll });
    void qc.invalidateQueries({ queryKey: qk.wildcards(useSession.getState().profileId) });
  };
  const lastPart = (p: string) => p.replace(/\\/g, "/").split("/").pop() ?? p;
  const parentOf = (p: string) => {
    const n = p.replace(/\\/g, "/");
    return n.includes("/") ? n.slice(0, n.lastIndexOf("/") + 1) : "";
  };
  const renameItem = (item: Item) => {
    const m = item.local;
    if (tab === "wildcards")
      return setRenaming({
        title: "Rename wildcard",
        description: "Its .txt file is renamed. Full __references__ to it follow.",
        name: lastPart(item.id),
        suffix: ".txt",
        run: async (to) => afterRename(await api.renameWildcard(item.id, to, false), null, true),
      });
    if (!m || !kind) return;
    const ext = m.file.slice(m.file.replace(/\.[^.]+$/, "").length);
    setRenaming({
      title: "Rename model",
      description: "Its info files and pictures are renamed with it.",
      name: m.file.slice(0, m.file.length - ext.length),
      suffix: ext,
      run: async (to) => {
        const renamed = await renameModel.mutateAsync({ id: m.id, name: to });
        const newId = parentOf(item.id) + renamed.file;
        await afterRename(
          { kind: "lora", from: item.id, to: newId, folder: false },
          kind,
          kind === "loras",
        );
      },
    });
  };
  const renameFolder = (path: string) => {
    const at = fromTree(path);
    if (!at.folder) return;
    setRenaming({
      title: "Rename folder",
      description: "Everything inside keeps its name; only the folder's changes.",
      name: lastPart(at.folder),
      run: async (to) => {
        const change: RenameChange = {
          kind: tab === "wildcards" ? "wildcard" : "lora",
          from: at.folder,
          to: parentOf(at.folder) + to,
          folder: true,
        };
        if (tab === "wildcards") await api.renameWildcard(at.folder, to, true);
        else if (kind) await api.renameModelFolder(kind, at.folder, to, at.root);
        if (folder === path || (folder && inFolder(folder, path))) setFolder(null);
        await afterRename(change, kind, tab === "wildcards" || tab === "loras");
      },
    });
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
      const name = tagName(item.id);
      // A LoRA in use comes off again: its instant entry, or its tags and the words picking added.
      if (isSelected(item)) {
        const names = new Set([name.toLowerCase(), item.name.toLowerCase()]);
        const words = item.local?.triggerWords.join(", ") ?? "";
        if (instant.some((l) => names.has(l.name.toLowerCase())))
          setInstant(instant.filter((l) => !names.has(l.name.toLowerCase())));
        if (positive && findLoraTags(prompt).some((t) => names.has(t.name.toLowerCase())))
          setValue(positive.id, removeLora(prompt, [...names], words));
        // Tiles shift when one goes, so a held tile lets go.
        if (target?.kind === "lora" || target?.kind === "instant") onTarget(null);
        return;
      }
      // Instant unless its model info says otherwise (a LoRA ComfyUI lists but the models
      // folder doesn't have info for counts as instant).
      const asInstant = item.local?.instant ?? true;
      const words = item.local?.triggerWords.join(", ") ?? "";
      const tag = (strength: number) =>
        words ? `${formatLoraTag(name, strength)}, ${words}` : formatLoraTag(name, strength);
      const swapInstant = target?.kind === "instant" ? target.index : -1;
      // One swap per tile click: the tile lets go afterwards, so the next pick adds.
      if (swapTag && positive) {
        if (asInstant) {
          setValue(positive.id, removeLoraTag(prompt, swapTag));
          setInstant([...instant, { name, strength: item.local?.weight ?? swapTag.strength }]);
        } else
          setValue(
            positive.id,
            swapLoraTag(prompt, swapTag, name, item.local?.weight ?? swapTag.strength),
          );
        onTarget(null);
        return;
      }
      const old = instant[swapInstant];
      if (old) {
        const strength = item.local?.weight ?? old.strength;
        if (asInstant) setInstant(instant.map((l) => (l === old ? { name, strength } : l)));
        else {
          setInstant(instant.filter((l) => l !== old));
          append(tag(strength));
        }
        onTarget(null);
        return;
      }
      if (asInstant) setInstant([...instant, { name, strength: item.local?.weight ?? 1 }]);
      else append(tag(item.local?.weight ?? 1));
    } else if (tab === "wildcards") {
      if (swapWildcard && positive && prompt.includes(swapWildcard)) {
        if (swapWildcard === `__${item.id}__`) return;
        setValue(
          positive.id,
          prompt.replace(swapWildcard, () => `__${item.id}__`),
        );
        onTarget(null);
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
      label:
        tab === "loras"
          ? isSelected(item)
            ? "Remove LoRA"
            : "Add LoRA"
          : adds
            ? "Add to prompt"
            : "Use this model",
      icon: tab === "loras" && isSelected(item) ? "x" : adds ? "plus" : "check",
      disabled: isSelected(item) && tab !== "wildcards" && tab !== "loras",
      onSelect: () => pick(item),
    };
    const rename: MenuEntry = {
      id: "rename",
      label: "Rename…",
      icon: "edit",
      onSelect: () => renameItem(item),
    };
    if (item.local)
      return modelMenu(item.local, {
        first: [use, { type: "separator", id: "s0" }],
        file: [rename],
      });
    return [
      use,
      ...(tab === "wildcards" ? [rename] : []),
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
    <div className="flex h-[75svh] min-h-[420px] flex-col gap-3">
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
          <MultiSelect
            value={baseModels}
            onChange={setBaseModels}
            label="Base models"
            clearLabel="All base models"
            className="w-52"
            options={bases.map((b) => ({ value: b.name, label: b.label, group: b.group }))}
          />
        ) : null}
        <IconButton
          icon={showLoaded ? "eye" : "eye-off"}
          label={
            showLoaded
              ? "Showing what the workflow uses first (click to list it like the rest)"
              : "Show what the workflow uses first, past the search and filters"
          }
          variant="secondary"
          active={showLoaded}
          onClick={() => updateSettings.mutate({ generate: { pickerShowLoaded: !showLoaded } })}
        />
        <Select<Sort>
          value={sort}
          onChange={pickSort}
          label="Sort"
          className="w-40"
          options={tab === "wildcards" ? SORTS.filter((s) => !s.files) : SORTS}
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
        {tab !== "wildcards" ? (
          <IconButton
            icon="rescan-models"
            label="Rescan model folders"
            variant="secondary"
            onClick={() => void rescanModels()}
          />
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        {showTree && !loading && !unavailable ? (
          <FolderTree
            nodes={tree}
            total={found.length}
            folder={folder}
            onFolder={setFolder}
            onMenu={(e, path) =>
              openContextMenu(e, [
                {
                  id: "open",
                  label: "Show in Explorer",
                  icon: "folder-open",
                  onSelect: () => openFolder(path),
                },
                // A profile models folder's own top folder is renamed in Settings → Folders.
                ...(fromTree(path).folder
                  ? [
                      {
                        id: "rename",
                        label: "Rename…",
                        icon: "edit",
                        onSelect: () => renameFolder(path),
                      } satisfies MenuEntry,
                    ]
                  : []),
              ])
            }
          />
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
                  : baseModels.length || folder
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
              columns={showTree ? COLUMNS.tree : COLUMNS.wide}
            />
          )}
        </div>
      </div>
      <RenameDialog target={renaming} onClose={() => setRenaming(null)} />
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
  columns: wanted,
}: {
  /** Cards a row when there's room. */
  columns: number;
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
  const columns = Math.max(1, Math.min(wanted, Math.floor((width + GAP) / (MIN_CARD_W + GAP))));
  const cardWidth = width > 0 ? Math.floor((width - GAP * (columns - 1)) / columns) : MIN_CARD_W;
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
