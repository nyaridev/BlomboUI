/**
 * Loaded models, always on top: the workflow's model loaders (checkpoint or diffusion model,
 * VAE, text encoders), then the LoRAs and the wildcards the prompt uses, each group under a
 * small label. Three looks (`settings.generate.tiles`): "pictures" puts each name on its
 * picture, "compact" shows smaller pictures only (names in the tooltip), "text" is one row of
 * chips without pictures. LoRAs come from two places: instant LoRAs (the workflow's list, marked
 * with a bolt; their trigger words are added when generating) and <lora:…> tags in the prompt.
 * The strength control, remove and dragging change whichever one the tile shows.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useModels, useSettings, useUpdateSettings } from "@client/lib/queries";
import { type CardKind, FallbackFace, IconButton, ScrubField, Slider, Tooltip } from "@client/ui";
import { INSTANT_LORAS, type InstantLora, readInstantLoras } from "@shared/prompt/instant";
import { findLoraTags, moveLoraTag, removeLoraTag, setLoraStrength } from "@shared/prompt/loras";
import { findWildcards } from "@shared/prompt/wildcards";
import type { Settings } from "@shared/settings";
import type { Binding } from "@shared/workflow/manifest";
import { type ReactNode, useMemo } from "react";
import { useModelThumb, useStrengthRange } from "../../models/thumbs";
import { modelDisplayName } from "../labels";
import { DropMarker, moveItem, NO_DRAG, type Sortable, useSortableRow } from "../sortable";
import { useValue } from "../state";
import { useRoleBinding } from "../workflow";

type PickTab = "checkpoints" | "loras" | "wildcards" | "other";
type TileSize = Settings["generate"]["tiles"];

/**
 * The tile the picker below is changing: a model loader, a LoRA tag (by its place in the prompt),
 * an instant LoRA (by its place in the list) or a wildcard. The + tiles are targets too (index
 * -1, name ""), so picking adds.
 */
export type StripTarget =
  | { kind: "binding"; id: string }
  | { kind: "lora"; index: number }
  | { kind: "instant"; index: number }
  | { kind: "wildcard"; name: string };

export const sameTarget = (a: StripTarget | null, b: StripTarget | null) =>
  a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);

/** The target's border: an accent outline, over a missing file's yellow one. */
const tileBorder = (active: boolean | undefined, missing: string | null | undefined) =>
  active
    ? "border-transparent"
    : missing
      ? "border-yellow/60"
      : "border-line hover:border-line-strong";

/** The selected tile's glow, over the picture (an inset shadow on the tile would sit under it). */
function SelectedGlow({ on }: { on: boolean | undefined }) {
  return on ? (
    <span className="pointer-events-none absolute inset-0 z-[2] rounded-[inherit] shadow-selected" />
  ) : null;
}

const stem = (f: string) => modelDisplayName(f).toLowerCase();
const strengthText = (v: number) => String(Number(v.toFixed(2)));

const TILE_WIDTH: Record<TileSize, string> = { pictures: "w-28", compact: "w-16", text: "" };
const TILE = "relative aspect-[2/3] shrink-0 rounded-lg border";
/** Shown while the tile is hovered or holds focus (and always on touch screens). */
const ON_HOVER =
  "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100";

/* ── Tiles ─────────────────────────────────────────────────────────────── */

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

interface TileProps {
  size: TileSize;
  kind: CardKind;
  /** The file or tag name ("" when nothing is picked). */
  name: string;
  /** What it is, for the tooltip and screen readers, and the chip's label in "text". */
  what: string;
  /** Why it won't work, when it won't (a warning icon and the tooltip say it). */
  missing?: string | null;
  /** A LoRA's strength. */
  strength?: { value: number; onChange: (v: number) => void };
  /** An instant LoRA (a bolt in the corner). */
  instant?: boolean;
  onOpen: () => void;
  onRemove?: () => void;
  sortable?: Sortable;
  /** The picker below is changing this tile. */
  active?: boolean;
}

/**
 * One model, picture or chip. The picture (or the name) is the button that opens the matching
 * picker; the corners hold what you need at a glance (strength, a warning, remove) and the
 * bottom the name or, on hover, the strength slider.
 */
function Tile(props: TileProps) {
  const [min, max] = useStrengthRange(props.strength ? props.name : "");
  if (props.size === "text") return <TextTile {...props} />;
  const { size, kind, name, what, missing, strength, instant, onOpen, onRemove, sortable, active } =
    props;
  const shown = name ? modelDisplayName(name) : "Pick a model";
  return (
    <div
      {...sortable?.drag}
      className={cn(
        TILE,
        TILE_WIDTH[size],
        "group bg-surface-2 transition-[width,border-color,opacity] duration-200",
        tileBorder(active, missing),
        sortable && "cursor-grab active:cursor-grabbing",
        sortable?.dragging && "opacity-30",
      )}
    >
      <DropMarker at={sortable?.marker ?? null} />
      <SelectedGlow on={active} />
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        <Tooltip content={missing ? `${what}: ${shown}. ${missing}` : `${what}: ${shown}`}>
          <button
            type="button"
            onClick={onOpen}
            onKeyDown={sortable?.onKeyDown}
            aria-label={`${what}: ${shown}`}
            aria-pressed={active ?? false}
            aria-keyshortcuts={sortable ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
            className="absolute inset-0 block cursor-[inherit] focus-ring"
          >
            <TileFace kind={kind} name={name} />
            {size === "pictures" || strength ? (
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
                  strength &&
                    "transition-opacity group-focus-within:opacity-0 group-hover:opacity-0 pointer-coarse:opacity-0",
                )}
              >
                {shown}
              </span>
            ) : null}
          </button>
        </Tooltip>
        {strength || missing ? (
          <span className="pointer-events-none absolute top-1 left-1 flex items-center gap-0.5">
            {instant ? (
              <span className="grid h-4.5 w-4.5 place-items-center rounded-xs bg-black/75 text-white">
                <Icon name="bolt" size={11} fill="currentColor" />
              </span>
            ) : null}
            {strength ? (
              <span className="rounded-xs bg-black/75 px-1 font-mono text-xs leading-4.5 text-white tabular">
                {strengthText(strength.value)}
              </span>
            ) : null}
            {missing ? (
              <span className="grid h-4.5 w-4.5 place-items-center rounded-xs bg-black/75 text-yellow">
                <Icon name="info" size={11} />
              </span>
            ) : null}
          </span>
        ) : null}
        {strength ? (
          <div {...{ [NO_DRAG]: "" }} className={cn("absolute inset-x-1.5 bottom-0.5", ON_HOVER)}>
            <Slider
              value={strength.value}
              onChange={strength.onChange}
              min={min}
              max={max}
              step={0.05}
              size="sm"
              ariaLabel={`${modelDisplayName(name)} strength`}
              defaultValue={Math.min(max, Math.max(min, 1))}
            />
          </div>
        ) : null}
        {onRemove ? (
          <div {...{ [NO_DRAG]: "" }} className={cn("absolute top-0.5 right-0.5", ON_HOVER)}>
            <IconButton
              icon="x"
              label={`Remove ${modelDisplayName(name)}`}
              size="xs"
              tooltip={false}
              onClick={onRemove}
              className="bg-black/75 text-white hover:bg-black/90 hover:text-white"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The "text" look: one chip with the role, the name and, for a LoRA, a strength field. */
function TextTile({
  kind,
  name,
  what,
  missing,
  strength,
  onOpen,
  onRemove,
  sortable,
  active,
}: TileProps) {
  const [min, max] = useStrengthRange(strength ? name : "");
  const shown = name ? modelDisplayName(name) : "Pick a model";
  return (
    <div
      {...sortable?.drag}
      className={cn(
        "group relative flex h-7 shrink-0 items-center rounded-md border bg-surface-2 transition-[border-color,opacity]",
        tileBorder(active, missing),
        sortable && "cursor-grab active:cursor-grabbing",
        sortable?.dragging && "opacity-30",
      )}
    >
      <DropMarker at={sortable?.marker ?? null} />
      <SelectedGlow on={active} />
      <Tooltip content={missing ? `${what}: ${shown}. ${missing}` : `${what}: ${shown}`}>
        <button
          type="button"
          onClick={onOpen}
          onKeyDown={sortable?.onKeyDown}
          aria-label={`${what}: ${shown}`}
          aria-pressed={active ?? false}
          aria-keyshortcuts={sortable ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
          className="flex h-full max-w-60 min-w-0 cursor-[inherit] items-center gap-1.5 rounded-md px-2 text-xs focus-ring"
        >
          <span className="label-caps shrink-0 text-[10px]">{what}</span>
          <span className={cn("truncate text-fg", kind === "wildcards" && "font-mono")}>
            {shown}
          </span>
          {missing ? <Icon name="info" size={12} className="shrink-0 text-yellow" /> : null}
        </button>
      </Tooltip>
      {strength ? (
        <div {...{ [NO_DRAG]: "" }} className="h-full w-14 shrink-0">
          <ScrubField
            value={strength.value}
            onChange={strength.onChange}
            min={min}
            max={max}
            step={0.05}
            size="sm"
            ariaLabel={`${modelDisplayName(name)} strength`}
            defaultValue={Math.min(max, Math.max(min, 1))}
            format={strengthText}
            className="h-full rounded-none border-y-0 border-r-0 text-xs"
          />
        </div>
      ) : null}
      {onRemove ? (
        <div
          {...{ [NO_DRAG]: "" }}
          className="hidden pr-0.5 group-focus-within:block group-hover:block pointer-coarse:block"
        >
          <IconButton
            icon="x"
            label={`Remove ${modelDisplayName(name)}`}
            size="xs"
            tooltip={false}
            onClick={onRemove}
          />
        </div>
      ) : null}
    </div>
  );
}

function AddTile({
  size,
  what,
  active,
  onClick,
}: {
  size: TileSize;
  what: string;
  active: boolean;
  onClick: () => void;
}) {
  const text = size === "text";
  return (
    <Tooltip content={`Add ${what}`}>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Add ${what}`}
        aria-pressed={active}
        className={cn(
          "shrink-0 transition-[width,border-color,color] duration-200 focus-ring",
          active
            ? "border-accent text-accent-ink shadow-[0_0_0_1px_var(--accent)]"
            : "border-dashed border-line-strong text-fg-3 hover:border-accent/60 hover:text-fg",
          text
            ? "flex h-7 items-center rounded-md border px-2"
            : cn(TILE, TILE_WIDTH[size], "grid place-items-center"),
        )}
      >
        <Icon name="plus" size={text ? 14 : size === "pictures" ? 22 : 18} />
      </button>
    </Tooltip>
  );
}

function BindingTile({
  binding,
  size,
  active,
  onClick,
}: {
  binding: Binding;
  size: TileSize;
  active: boolean;
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
      active={active}
    />
  );
}

/* ── The strip ─────────────────────────────────────────────────────────── */

/** A label over a tile or a group of tiles ("Checkpoint", "LoRAs"); the chips carry their own. */
function Labeled({
  label,
  size,
  children,
}: {
  label: string;
  size: TileSize;
  children: ReactNode;
}) {
  if (size === "text") return <div className="flex shrink-0 items-center gap-1.5">{children}</div>;
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <span title={label} className="label-caps max-w-40 truncate text-[10px] leading-3">
        {label}
      </span>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

const Divider = () => <span className="mx-1 w-px shrink-0 self-stretch bg-line" />;

/** The look switches, full height on the left: text chips on top, bigger / smaller below. */
function LookSwitch({ size, onChange }: { size: TileSize; onChange: (s: TileSize) => void }) {
  const button =
    "grid w-6 shrink-0 place-items-center rounded-md border bg-surface-2 transition-colors hover:border-line-strong hover:text-fg focus-ring";
  const text = size === "text";
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <Tooltip content={text ? "Show pictures" : "Text only"}>
        <button
          type="button"
          aria-label="Text only"
          aria-pressed={text}
          onClick={() => onChange(text ? "pictures" : "text")}
          className={cn(
            button,
            text ? "h-7 border-accent/60 text-accent-ink" : "h-6 border-line text-fg-3",
          )}
        >
          <Icon name="layout-rows" size={13} />
        </button>
      </Tooltip>
      {text ? null : (
        <Tooltip content={size === "pictures" ? "Smaller pictures" : "Bigger pictures, with names"}>
          <button
            type="button"
            aria-label={size === "pictures" ? "Smaller pictures" : "Bigger pictures, with names"}
            onClick={() => onChange(size === "pictures" ? "compact" : "pictures")}
            className={cn(button, "flex-1 border-line text-fg-3")}
          >
            <Icon name={size === "pictures" ? "chevron-up" : "chevron-down"} size={14} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

export function ModelsStrip({
  target,
  onTarget,
}: {
  target: StripTarget | null;
  /** Change the target, opening `tab` (leaving out `tab` keeps the one open). */
  onTarget: (target: StripTarget | null, tab?: PickTab | "generation") => void;
}) {
  const checkpoint = useRoleBinding("model.checkpoint");
  const unet = useRoleBinding("model.unet");
  const vae = useRoleBinding("model.vae");
  const clip = useRoleBinding("model.clip");
  const clip2 = useRoleBinding("model.clip2");
  const positive = useRoleBinding("prompt.positive");
  const [prompt, setPrompt] = useValue<string>(positive?.id ?? "prompt.positive");
  const text = typeof prompt === "string" ? prompt : "";
  const loras = useMemo(() => findLoraTags(text), [text]);
  const [savedInstant, setSavedInstant] = useValue<unknown>(INSTANT_LORAS);
  const instant = useMemo(() => readInstantLoras(savedInstant), [savedInstant]);
  const wildcards = useMemo(() => findWildcards(text), [text]);
  const loraFiles = useModels(loras.length || instant.length ? "loras" : null).data?.names;
  const size: TileSize = useSettings().data?.generate.tiles ?? "pictures";
  const updateSettings = useUpdateSettings();
  // Clicking the targeted tile again closes the picker.
  const open = (t: StripTarget, tab: PickTab) =>
    sameTarget(t, target) ? onTarget(null, "generation") : onTarget(t, tab);
  // LoRA targets are places in the prompt: moving or removing tags makes them point elsewhere.
  const loraEdit = (next: string) => {
    setPrompt(next);
    if (target?.kind === "lora" && target.index >= 0) onTarget(null);
  };
  const sortable = useSortableRow(loras.length, (from, to) =>
    loraEdit(moveLoraTag(text, from, to)),
  );
  // Instant LoRA targets are places in the list, so they let go the same way.
  const instantEdit = (next: InstantLora[]) => {
    setSavedInstant(next);
    if (target?.kind === "instant") onTarget(null);
  };
  const sortableInstant = useSortableRow(instant.length, (from, to) =>
    instantEdit(moveItem(instant, from, to)),
  );
  const missingLora = (name: string) =>
    loraFiles && !loraFiles.some((f) => stem(f) === stem(name))
      ? "Not in your loras folder: generating will stop with an error"
      : null;
  const main = checkpoint ?? unet;
  const models = [main, vae, clip, clip2].filter((b): b is Binding => Boolean(b));

  return (
    <div className="flex items-stretch gap-2">
      <LookSwitch
        size={size}
        onChange={(tiles) => updateSettings.mutate({ generate: { tiles } })}
      />
      <div
        className={cn(
          "scroll-quiet flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5",
          size === "text" ? "items-center" : "items-stretch",
        )}
      >
        {models.map((b) => (
          <Labeled key={b.id} label={b.label} size={size}>
            <BindingTile
              binding={b}
              size={size}
              active={sameTarget(target, { kind: "binding", id: b.id })}
              onClick={() =>
                open({ kind: "binding", id: b.id }, b === main ? "checkpoints" : "other")
              }
            />
          </Labeled>
        ))}

        {positive ? (
          <>
            {models.length ? <Divider /> : null}
            <Labeled label="LoRAs" size={size}>
              {instant.map((l, i) => (
                <Tile
                  // Keyed by place, like the tags.
                  key={`instant-${i}`}
                  size={size}
                  kind="loras"
                  name={l.name}
                  what="Instant LoRA"
                  instant
                  missing={missingLora(l.name)}
                  strength={{
                    value: l.strength,
                    onChange: (v) =>
                      setSavedInstant(instant.map((x) => (x === l ? { ...x, strength: v } : x))),
                  }}
                  active={sameTarget(target, { kind: "instant", index: i })}
                  onOpen={() => open({ kind: "instant", index: i }, "loras")}
                  onRemove={() => instantEdit(instant.filter((x) => x !== l))}
                  sortable={sortableInstant(i)}
                />
              ))}
              {loras.map((tag, i) => (
                // Keyed by place: a swap or a move changes the tile in place, no new tile.
                <Tile
                  key={i}
                  size={size}
                  kind="loras"
                  name={tag.name}
                  what="LoRA"
                  missing={missingLora(tag.name)}
                  strength={{
                    value: tag.strength,
                    onChange: (v) => setPrompt(setLoraStrength(text, tag, v)),
                  }}
                  active={sameTarget(target, { kind: "lora", index: i })}
                  onOpen={() => open({ kind: "lora", index: i }, "loras")}
                  onRemove={() => loraEdit(removeLoraTag(text, tag))}
                  sortable={sortable(i)}
                />
              ))}
              <AddTile
                size={size}
                what="LoRA"
                active={sameTarget(target, { kind: "lora", index: -1 })}
                onClick={() => open({ kind: "lora", index: -1 }, "loras")}
              />
            </Labeled>

            <Divider />
            <Labeled label="Wildcards" size={size}>
              {wildcards.map((w) => (
                <Tile
                  key={w}
                  size={size}
                  kind="wildcards"
                  name={w}
                  what="Wildcard"
                  active={sameTarget(target, { kind: "wildcard", name: w })}
                  onOpen={() => open({ kind: "wildcard", name: w }, "wildcards")}
                />
              ))}
              <AddTile
                size={size}
                what="wildcard"
                active={sameTarget(target, { kind: "wildcard", name: "" })}
                onClick={() => open({ kind: "wildcard", name: "" }, "wildcards")}
              />
            </Labeled>
          </>
        ) : null}
      </div>
    </div>
  );
}
