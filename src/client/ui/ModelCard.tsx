/**
 * The one model card used everywhere (Generate pickers, Models view, Civitai results).
 * When there is no thumbnail it shows a designed face: kind color, kind icon, monogram and
 * base-model badge, so a wall of un-thumbnailed LoRAs still reads well.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { hashString } from "@client/lib/seeded";
import type { ModelKind } from "@shared/constants";
import type { ReactNode } from "react";
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

function monogram(name: string): string {
  const words = name
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[\s_\-.]+/)
    .filter(Boolean);
  const letters =
    words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [words[0]?.[0], words[0]?.[1]];
  return letters.filter(Boolean).join("").toUpperCase();
}

export function FallbackFace({
  name,
  kind,
  className,
}: {
  name: string;
  kind: CardKind;
  className?: string;
}) {
  const style = KIND_STYLE[kind];
  const h = hashString(name);
  const angle = h % 360;
  const shift = (h >> 8) % 40;
  return (
    <div
      className={cn(
        positioned(className),
        "grid h-full w-full place-items-center overflow-hidden",
        className,
      )}
      style={{
        background: `linear-gradient(${angle}deg, color-mix(in oklab, var(--${style.color}) ${18 + (shift % 14)}%, var(--surface-2)), var(--surface) 70%)`,
      }}
    >
      <span
        className="pointer-events-none absolute -right-2 -bottom-6 font-bold leading-none tracking-tighter select-none"
        style={{
          fontSize: "7.5em",
          color: `color-mix(in oklab, var(--${style.color}-ink) 14%, transparent)`,
        }}
      >
        {monogram(name)}
      </span>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[.07]"
        aria-hidden="true"
      >
        <defs>
          <pattern id={`dots-${kind}`} width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#dots-${kind})`} className="text-fg" />
      </svg>
      <span
        className="relative grid h-12 w-12 place-items-center rounded-xl border"
        style={{
          color: `var(--${style.color}-ink)`,
          borderColor: `color-mix(in oklab, var(--${style.color}-ink) 30%, transparent)`,
          background: `color-mix(in oklab, var(--${style.color}) 16%, transparent)`,
        }}
      >
        <Icon name={style.icon} size={24} />
      </span>
    </div>
  );
}

export interface ModelCardProps {
  name: string;
  kind: CardKind;
  baseModel?: string;
  /** Image URL, or `art:<seed>` for a procedural preview. Missing → designed fallback face. */
  thumb?: string | null;
  selected?: boolean;
  favorite?: boolean;
  onClick?: () => void;
  onFavorite?: () => void;
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
  footer,
  ratio = 3 / 4,
  className,
}: ModelCardProps) {
  const style = KIND_STYLE[kind];
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-surface-2 transition-[border-color,box-shadow,transform] duration-200",
        selected
          ? "border-accent shadow-[0_0_0_1px_var(--accent),0_8px_24px_-8px_color-mix(in_oklab,var(--accent)_55%,transparent)]"
          : "border-line hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop",
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-label={`${style.label}: ${name}`}
        className="relative block w-full overflow-hidden text-left focus-ring"
        style={{ aspectRatio: String(ratio) }}
      >
        {thumb?.startsWith("art:") ? (
          <Art
            seed={thumb.slice(4)}
            className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
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
        {selected ? (
          <span className="absolute top-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-accent text-on-accent shadow">
            <Icon name="check" size={13} strokeWidth={2.5} />
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-2.5">
          <span className="line-clamp-2 text-sm leading-tight font-medium text-white">{name}</span>
          <span className="flex items-center gap-1 text-2xs text-white/60">
            <Icon name={style.icon} size={11} />
            {style.label}
          </span>
        </div>
      </button>
      {onFavorite ? (
        <button
          type="button"
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={favorite}
          onClick={onFavorite}
          className={cn(
            "absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white/80 backdrop-blur-[2px] transition-opacity hover:text-white",
            favorite
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            selected && "top-9",
          )}
        >
          <Icon
            name="heart"
            size={14}
            className={favorite ? "fill-current text-pink-ink" : undefined}
          />
        </button>
      ) : null}
      {footer ? <div className="border-t border-line px-2.5 py-2">{footer}</div> : null}
    </div>
  );
}
