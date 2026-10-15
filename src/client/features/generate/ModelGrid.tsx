/**
 * Model pickers beside Generation: checkpoints (or diffusion models), LoRAs, wildcards and other
 * model kinds, listed from ComfyUI and the profile's wildcards folder. Picking sets the
 * workflow's model, adds a <lora:…> tag or a __wildcard__ to the prompt. The grid is virtualized:
 * LoRA folders often hold thousands of files.
 */
import { Icon } from "@client/icons/Icon";
import { useElementWidth } from "@client/lib/hooks";
import { useModels, useWildcards } from "@client/lib/queries";
import { type CardKind, ModelCard, Segmented, Spinner, TextField, toast } from "@client/ui";
import type { ModelKind } from "@shared/constants";
import { findLoraTags, formatLoraTag } from "@shared/prompt/loras";
import type { Binding } from "@shared/workflow/manifest";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { modelDisplayName, modelFolder } from "./labels";
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

const CARD_MIN = 170;
const GAP = 12;

interface Item {
  id: string;
  name: string;
  kind: CardKind;
  folder: string | null;
}

/** Without an extension, as LoRA tags are usually written. */
const tagName = (file: string) =>
  file.replace(/\\/g, "/").replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, "");

export function ModelGrid({ tab, onDone }: { tab: PickerTab; onDone: () => void }) {
  const bindings = useBindings();
  const [otherKind, setOtherKind] = useState<ModelKind>("vae");
  const main =
    bindings.find((b) => b.role === "model.checkpoint") ??
    bindings.find((b) => b.role === "model.unet");
  const positive = bindings.find((b) => b.role === "prompt.positive");

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

  // Which binding a pick sets (models), or how it edits the prompt (LoRAs, wildcards, embeddings).
  const target: Binding | undefined =
    tab === "checkpoints"
      ? main
      : tab === "other"
        ? bindings.find((b) => b.type === "model" && b.modelKind === otherKind)
        : undefined;
  const selectedValue = useValues((s) => (target ? s.values[target.id] : undefined));
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
    }));
  }, [tab, models.data, wildcards.data, kind]);

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = q ? items.filter((i) => i.id.toLowerCase().includes(q)) : items;
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
    if (tab === "loras") {
      if (isSelected(item)) return;
      append(formatLoraTag(tagName(item.id), 1));
      toast(`Added ${item.name} to the prompt`, "success");
    } else if (tab === "wildcards") {
      append(`__${item.id}__`);
      toast(`Added __${item.id}__ to the prompt`, "success");
    } else if (tab === "other" && otherKind === "embeddings") {
      append(`embedding:${tagName(item.id)}`);
    } else if (target) {
      setValue(target.id, item.id);
      onDone();
    } else {
      toast("This workflow doesn't use that kind of model.", "info");
    }
  };

  const loading = tab === "wildcards" ? wildcards.isLoading : models.isLoading;
  const unavailable = tab !== "wildcards" && models.data && !models.data.available;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pt-3">
      <div className="flex items-center gap-2">
        <TextField
          icon="search"
          placeholder={`Search ${tab === "other" ? OTHER_KINDS.find((k) => k.value === otherKind)?.label.toLowerCase() : tab}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          className="w-80"
        />
        {tab === "other" ? (
          <Segmented
            size="sm"
            value={otherKind}
            onChange={setOtherKind}
            label="Model kind"
            options={OTHER_KINDS}
          />
        ) : null}
        <span className="ml-auto text-xs text-fg-3">{list.length} items</span>
      </div>
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
              ? `Nothing matches "${query}".`
              : "Nothing here yet. Add files to the folder, then rescan models from the header."
          }
        />
      ) : (
        <VirtualGrid items={list} isSelected={isSelected} onPick={pick} />
      )}
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
}: {
  items: Item[];
  isSelected: (i: Item) => boolean;
  onPick: (i: Item) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const width = useElementWidth(scroller);
  const columns = Math.max(1, Math.floor((Math.max(width, CARD_MIN) + GAP) / (CARD_MIN + GAP)));
  const cardWidth = (Math.max(width, CARD_MIN) - GAP * (columns - 1)) / columns;
  const rowHeight = Math.round((cardWidth * 4) / 3) + GAP;
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
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: GAP,
            }}
          >
            {items.slice(row.index * columns, row.index * columns + columns).map((item) => (
              <ModelCard
                key={item.id}
                name={item.name}
                kind={item.kind}
                baseModel={item.folder ?? undefined}
                selected={isSelected(item)}
                onClick={() => onPick(item)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
