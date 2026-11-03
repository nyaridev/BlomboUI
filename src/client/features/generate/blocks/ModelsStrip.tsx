/**
 * Loaded models, always on top: the workflow's model loaders (checkpoint or diffusion model,
 * VAE, text encoders) plus the LoRAs and wildcards the prompt uses, as portrait picture tiles.
 * "pictures" puts each name on its picture; "compact" shows smaller pictures only (names in the
 * tooltip). LoRA tiles are two-way: they come from <lora:…> tags, and the strength slider that
 * shows on hover rewrites the tag in the prompt.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useModels, useSettings, useUpdateSettings } from "@client/lib/queries";
import { type CardKind, FallbackFace, IconButton, Slider, Tooltip } from "@client/ui";
import { findLoraTags, type LoraTag, removeLoraTag, setLoraStrength } from "@shared/prompt/loras";
import { findWildcards } from "@shared/prompt/wildcards";
import type { Settings } from "@shared/settings";
import type { Binding } from "@shared/workflow/manifest";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useMemo } from "react";
import { useModelThumb } from "../../models/thumbs";
import { modelDisplayName } from "../labels";
import { useValue } from "../state";
import { useRoleBinding } from "../workflow";

type PickTab = "checkpoints" | "loras" | "wildcards" | "other";
type TileSize = Settings["generate"]["tiles"];

const stem = (f: string) => modelDisplayName(f).toLowerCase();

const TILE_WIDTH: Record<TileSize, string> = { pictures: "w-28", compact: "w-16" };
const TILE = "relative aspect-[2/3] shrink-0 overflow-hidden rounded-lg border";
/** Shown while the tile is hovered or holds focus (and always on touch screens). */
const ON_HOVER =
  "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100";

/** A tile's picture: the model's own, else the designed fallback. */
function TileFace({ kind, name }: { kind: CardKind; name: string }) {
  const { thumb, nsfw } = useModelThumb(kind === "wildcards" ? "loras" : kind, name);
  const blur = useSettings().data?.models.blurNsfw ?? true;
  if (kind !== "wildcards" && thumb && !(nsfw && blur))
    return (
      <img
        src={thumb}
        alt=""
        loading="lazy"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
      />
    );
  return <FallbackFace name={name || "?"} kind={kind} className="absolute inset-0 text-[6px]" />;
}

/**
 * One tile. The picture is the button that opens the matching picker; the corners hold what you
 * need at a glance (strength, a warning, remove) and the bottom the name or, on hover, a control.
 */
function Tile({
  size,
  kind,
  name,
  what,
  missing,
  badge,
  onOpen,
  control,
  onRemove,
}: {
  size: TileSize;
  kind: CardKind;
  /** The file or tag name ("" when nothing is picked). */
  name: string;
  /** What it is, for the tooltip and screen readers ("Checkpoint", "LoRA"). */
  what: string;
  /** Why it won't work, when it won't (shown as a warning icon and in the tooltip). */
  missing?: string | null;
  badge?: string;
  onOpen: () => void;
  /** Takes the name's place while hovered or focused (the LoRA strength slider). */
  control?: ReactNode;
  onRemove?: () => void;
}) {
  const shown = name ? modelDisplayName(name) : "Pick a model";
  return (
    <div
      className={cn(
        TILE,
        TILE_WIDTH[size],
        "group bg-surface-2 transition-[width,border-color] duration-200",
        missing ? "border-yellow/60" : "border-line hover:border-line-strong",
      )}
    >
      <Tooltip content={missing ? `${what}: ${shown}. ${missing}` : `${what}: ${shown}`}>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${what}: ${shown}`}
          className="absolute inset-0 block focus-ring"
        >
          <TileFace kind={kind} name={name} />
          {size === "pictures" || control ? (
            <span
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 via-black/35 to-transparent",
                size === "compact" && ON_HOVER,
              )}
            />
          ) : null}
          {size === "pictures" ? (
            <span
              className={cn(
                "absolute inset-x-0 bottom-0 line-clamp-2 p-1.5 text-left text-xs leading-tight font-medium [overflow-wrap:anywhere] text-white",
                kind === "wildcards" && "font-mono",
                Boolean(control) &&
                  "transition-opacity group-focus-within:opacity-0 group-hover:opacity-0 pointer-coarse:opacity-0",
              )}
            >
              {shown}
            </span>
          ) : null}
        </button>
      </Tooltip>
      {badge || missing ? (
        <span className="pointer-events-none absolute top-1 left-1 flex items-center gap-0.5">
          {badge ? (
            <span className="rounded-xs bg-black/60 px-1 font-mono text-[10px] leading-4 text-white tabular">
              {badge}
            </span>
          ) : null}
          {missing ? (
            <span className="grid h-4 w-4 place-items-center rounded-xs bg-black/60 text-yellow">
              <Icon name="info" size={11} />
            </span>
          ) : null}
        </span>
      ) : null}
      {control ? (
        <div className={cn("absolute inset-x-1.5 bottom-0.5", ON_HOVER)}>{control}</div>
      ) : null}
      {onRemove ? (
        <div className={cn("absolute top-0.5 right-0.5", ON_HOVER)}>
          <IconButton
            icon="x"
            label={`Remove ${modelDisplayName(name)}`}
            size="xs"
            tooltip={false}
            onClick={onRemove}
            className="bg-black/60 text-white hover:bg-black/80 hover:text-white"
          />
        </div>
      ) : null}
    </div>
  );
}

function BindingTile({
  binding,
  size,
  onClick,
}: {
  binding: Binding;
  size: TileSize;
  onClick: () => void;
}) {
  const [value] = useValue<string>(binding.id);
  const name = typeof value === "string" ? value : "";
  const missing = Boolean(name && binding.options && !binding.options.includes(name));
  return (
    <Tile
      size={size}
      kind={binding.modelKind ?? "checkpoints"}
      name={name}
      what={binding.label}
      missing={missing ? "Not in your models folder" : null}
      onOpen={onClick}
    />
  );
}

export function ModelsStrip({ onPick }: { onPick: (tab: PickTab) => void }) {
  const checkpoint = useRoleBinding("model.checkpoint");
  const unet = useRoleBinding("model.unet");
  const vae = useRoleBinding("model.vae");
  const clip = useRoleBinding("model.clip");
  const clip2 = useRoleBinding("model.clip2");
  const positive = useRoleBinding("prompt.positive");
  const [prompt, setPrompt] = useValue<string>(positive?.id ?? "prompt.positive");
  const text = typeof prompt === "string" ? prompt : "";
  const loras = useMemo(() => findLoraTags(text), [text]);
  const wildcards = useMemo(() => findWildcards(text), [text]);
  const loraFiles = useModels(loras.length ? "loras" : null).data?.names;
  const size: TileSize = useSettings().data?.generate.tiles ?? "pictures";
  const updateSettings = useUpdateSettings();
  const main = checkpoint ?? unet;
  const models = [main, vae, clip, clip2].filter((b): b is Binding => Boolean(b));

  return (
    <div className="flex items-center gap-2">
      <IconButton
        icon={size === "pictures" ? "chevron-up" : "chevron-down"}
        label={size === "pictures" ? "Smaller tiles" : "Bigger tiles, with names"}
        size="xs"
        onClick={() =>
          updateSettings.mutate({
            generate: { tiles: size === "pictures" ? "compact" : "pictures" },
          })
        }
      />
      <div className="scroll-quiet flex min-w-0 flex-1 items-stretch gap-2 overflow-x-auto pb-0.5">
        {models.map((b) => (
          <BindingTile
            key={b.id}
            binding={b}
            size={size}
            onClick={() => onPick(b === main ? "checkpoints" : "other")}
          />
        ))}

        {models.length ? <span className="mx-1 w-px shrink-0 bg-line" /> : null}

        <AnimatePresence initial={false}>
          {loras.map((tag) => (
            <LoraTile
              key={tag.name}
              tag={tag}
              size={size}
              missing={Boolean(loraFiles && !loraFiles.some((f) => stem(f) === stem(tag.name)))}
              onOpen={() => onPick("loras")}
              onStrength={(v) => setPrompt(setLoraStrength(text, tag, v))}
              onRemove={() => setPrompt(removeLoraTag(text, tag))}
            />
          ))}
        </AnimatePresence>

        {wildcards.map((w) => (
          <Tile
            key={w}
            size={size}
            kind="wildcards"
            name={w}
            what="Wildcard, a random line each run"
            onOpen={() => onPick("wildcards")}
          />
        ))}

        {positive ? (
          <Tooltip content="Add LoRA">
            <button
              type="button"
              onClick={() => onPick("loras")}
              aria-label="Add LoRA"
              className={cn(
                TILE,
                TILE_WIDTH[size],
                "grid place-items-center border-dashed border-line-strong text-fg-3 transition-[width,border-color,color] duration-200",
                "hover:border-accent/60 hover:text-fg focus-ring",
              )}
            >
              <Icon name="plus" size={size === "pictures" ? 22 : 18} />
            </button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}

function LoraTile({
  tag,
  size,
  missing,
  onOpen,
  onStrength,
  onRemove,
}: {
  tag: LoraTag;
  size: TileSize;
  missing: boolean;
  onOpen: () => void;
  onStrength: (v: number) => void;
  onRemove: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex shrink-0"
    >
      <Tile
        size={size}
        kind="loras"
        name={tag.name}
        what="LoRA"
        badge={String(Number(tag.strength.toFixed(2)))}
        missing={missing ? "Not in your loras folder: generating will stop with an error" : null}
        onOpen={onOpen}
        onRemove={onRemove}
        control={
          <Slider
            value={tag.strength}
            onChange={onStrength}
            min={-1}
            max={2}
            step={0.05}
            size="sm"
            ariaLabel={`${modelDisplayName(tag.name)} strength`}
            defaultValue={1}
          />
        }
      />
    </motion.div>
  );
}
