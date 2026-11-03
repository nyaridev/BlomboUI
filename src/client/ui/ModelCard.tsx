/**
 * The one model card used everywhere (Generate pickers, Models view, Civitai results).
 * When there is no thumbnail it shows a checkerboard tinted in the kind's color with the kind's
 * icon (the old app's empty card), so a wall of un-thumbnailed LoRAs still reads by kind. Thumbnails marked NSFW
 * are blurred until clicked when `blurNsfw` is on (the profile's setting, on by default).
 * A `mark` pins a small status pill to the corner ("Installed", "Update", "Downloading").
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import type { ModelKind } from "@shared/constants";
import { type MouseEvent, type ReactNode, useState } from "react";
import { Art, positioned } from "./Art";

export type CardKind = ModelKind | "wildcards";

export const KIND_STYLE: Record<CardKind, { label: string; icon: IconName; color: string }> = {
  checkpoints: { label: "Checkpoint", icon: "models", color: "blue" },
  diffusion_models: { label: "Diffusion", icon: "models", color: "cyan" },
  loras: { label: "LoRA", icon: "layers", color: "purple" },
  vae: { label: "VAE", icon: "wave", color: "green" },
  text_encoders: { label: "Text encoder", icon: "text", color: "green" },
  upscale_models: { label: "Upscaler", icon: "upscale", color: "orange" },
  controlnet: { label: "ControlNet", icon: "pose", color: "pink" },
  embeddings: { label: "Embedding", icon: "hash", color: "yellow" },
  sams: { label: "SAM", icon: "face-scan", color: "red" },
  ultralytics: { label: "Detector", icon: "face-scan", color: "red" },
  wildcards: { label: "Wildcard", icon: "wildcards", color: "cyan" },
};

/** Squares of 14 px: two tints of the kind's color, over surface-2 and `--checker-alt`. */
const CHECKER = 28;

export function FallbackFace({
  kind,
  className,
}: {
  /** Kept so callers can pass the model; the face only follows the kind. */
  name?: string;
  kind: CardKind;
  className?: string;
}) {
  const color = KIND_STYLE[kind].color;
  return (
    <div
      className={cn(
        positioned(className),
        "grid h-full w-full place-items-center overflow-hidden",
        className,
      )}
      style={{
        background: `repeating-conic-gradient(color-mix(in oklab, var(--${color}) 12%, var(--surface-2)) 0 25%, color-mix(in oklab, var(--${color}) 18%, var(--checker-alt)) 0 50%) 0 0 / ${CHECKER}px ${CHECKER}px`,
      }}
    >
      <span
        className="relative grid h-12 w-12 place-items-center rounded-xl border"
        style={{
          color: `var(--${color}-ink)`,
          borderColor: `color-mix(in oklab, var(--${color}-ink) 30%, transparent)`,
          background: `color-mix(in oklab, var(--${color}) 22%, var(--surface))`,
        }}
      >
        <Icon name={KIND_STYLE[kind].icon} size={24} />
      </span>
    </div>
  );
}

const CORNER_BUTTON =
  "grid h-7 w-7 place-items-center rounded-sm bg-black/45 text-white/80 backdrop-blur-[2px] transition-opacity hover:text-white focus-ring";
/** Shown while the card is hovered or a button in it has keyboard focus (always on touch). */
const HOVER_ONLY =
  "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100";

export interface CardMark {
  label: string;
  icon: IconName;
  tone: "success" | "accent" | "warning";
}

const MARK_ICON: Record<CardMark["tone"], string> = {
  success: "text-green",
  accent: "text-accent",
  warning: "text-yellow",
};

export interface ModelCardProps {
  name: string;
  kind: CardKind;
  baseModel?: string;
  /** Image URL, or `art:<seed>` for a procedural preview. Missing → designed fallback face. */
  thumb?: string | null;
  selected?: boolean;
  favorite?: boolean;
  /** The thumbnail is marked NSFW. */
  nsfw?: boolean;
  /** Blur NSFW thumbnails until clicked. */
  blurNsfw?: boolean;
  /** Small line under the name (file size, trigger word…). */
  meta?: ReactNode;
  /** Status pill in the top-right corner of the image. */
  mark?: CardMark | null;
  /** The type as its source names it ("LyCORIS", "Workflows"), instead of the kind's label. */
  typeLabel?: string;
  onClick?: () => void;
  onFavorite?: () => void;
  /** Shows an info button beside the heart on hover (Model info…). */
  onInfo?: () => void;
  /** Right-click (openContextMenu). */
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void;
  footer?: ReactNode;
  ratio?: number;
  className?: string;
}

export function ModelCard({
  name,
  kind,
  baseModel,
  thumb,
  selected,
  favorite,
  onClick,
  onFavorite,
  onInfo,
  onContextMenu,
  footer,
  ratio = 3 / 4,
  nsfw,
  blurNsfw,
  meta,
  mark,
  typeLabel,
  className,
}: ModelCardProps) {
  const style = KIND_STYLE[kind];
  const label = typeLabel ?? style.label;
  const [revealed, setRevealed] = useState(false);
  const veiled = Boolean(thumb && nsfw && blurNsfw && !revealed);
  return (
    <div
      onContextMenu={onContextMenu}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-surface-2 transition-[border-color,box-shadow]",
        // Selected: the light outline and inner glow of a selected strip tile (`shadow-selected`).
        selected ? "border-transparent shadow-selected" : "border-line hover:border-line-strong",
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-label={`${label}: ${name}`}
        className="relative block w-full overflow-hidden text-left focus-ring"
        style={{ aspectRatio: String(ratio) }}
      >
        {thumb?.startsWith("art:") ? (
          <Art
            seed={thumb.slice(4)}
            className={cn(
              "absolute inset-0 transition-[filter,transform] duration-200 group-hover:scale-[1.04]",
              veiled && "scale-110 blur-xl saturate-50",
            )}
          />
        ) : thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-[filter,transform] duration-200",
              veiled && "scale-110 blur-xl saturate-50",
            )}
          />
        ) : (
          <FallbackFace name={name} kind={kind} className="absolute inset-0" />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        <div className="absolute top-2 left-2 flex gap-1">
          {baseModel ? (
            <span className="rounded-xs bg-black/55 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white/90 backdrop-blur-[2px]">
              {baseModel}
            </span>
          ) : null}
        </div>
        {mark ? (
          <span className="absolute top-2 right-2 inline-flex h-5 items-center gap-1 rounded-xs bg-black/60 pr-1.5 pl-1 text-[10px] font-semibold text-white backdrop-blur-[2px]">
            <Icon name={mark.icon} size={11} strokeWidth={2.25} className={MARK_ICON[mark.tone]} />
            {mark.label}
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-2.5">
          <span className="line-clamp-2 text-sm leading-tight font-medium text-white">{name}</span>
          <span className="flex items-center gap-1 text-2xs text-white/60">
            <Icon name={style.icon} size={11} />
            {label}
            {meta ? <span className="ml-auto truncate font-mono text-white/55">{meta}</span> : null}
          </span>
        </div>
      </button>
      {selected ? (
        <span className="pointer-events-none absolute inset-0 z-[5] rounded-[inherit] shadow-selected" />
      ) : null}
      {veiled ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          aria-label={`${name}: NSFW thumbnail, click to reveal`}
          className="absolute inset-x-0 top-0 z-10 flex flex-col items-center justify-center gap-1.5 text-white focus-ring"
          style={{ aspectRatio: String(ratio) }}
        >
          <span className="inline-flex items-center gap-1 rounded-xs bg-black/55 px-1.5 py-0.5 text-2xs font-semibold tracking-wide uppercase">
            <Icon name="eye-off" size={12} />
            NSFW
          </span>
          <span className="text-2xs text-white/75">Click to reveal</span>
        </button>
      ) : null}
      {onFavorite || onInfo ? (
        <div className="absolute top-2 right-2 z-[6] flex gap-1">
          {onInfo ? (
            <button
              type="button"
              aria-label={`Model info: ${name}`}
              title="Model info"
              onClick={onInfo}
              className={cn(CORNER_BUTTON, HOVER_ONLY)}
            >
              <Icon name="info" size={14} />
            </button>
          ) : null}
          {onFavorite ? (
            <button
              type="button"
              aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={favorite}
              onClick={onFavorite}
              className={cn(CORNER_BUTTON, favorite ? "opacity-100" : HOVER_ONLY)}
            >
              <Icon
                name="heart"
                size={14}
                className={favorite ? "fill-current text-pink-ink" : undefined}
              />
            </button>
          ) : null}
        </div>
      ) : null}
      {footer ? <div className="border-t border-line px-2.5 py-2">{footer}</div> : null}
    </div>
  );
}
