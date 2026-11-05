/**
 * Gallery toolbar: search, model / LoRA / tag / rating / origin / favorite filters, tile size,
 * layout and sort.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useGalleryFacets, useGalleryTags } from "@client/lib/queries";
import {
  Checkbox,
  Chip,
  IconButton,
  Popover,
  Segmented,
  Select,
  Slider,
  StarRating,
  TextField,
} from "@client/ui";
import { type GalleryFacets, IMAGE_ORIGINS, type ImageOrigin } from "@shared/gallery";
import type { GalleryLayout } from "@shared/settings";
import { useState } from "react";
import { SidebarButton } from "./Sidebar";
import {
  allOrigins,
  type GallerySort,
  newSeed,
  ORIGIN_ICON,
  ORIGIN_LABEL,
  useGalleryUi,
} from "./state";

export function Toolbar({
  size,
  onSize,
  layout,
  onLayout,
  total,
}: {
  size: number;
  onSize: (v: number) => void;
  layout: GalleryLayout;
  onLayout: (l: GalleryLayout) => void;
  total: number | null;
}) {
  const ui = useGalleryUi();
  const facets = useGalleryFacets(ui.library);
  const tags = useGalleryTags();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 max-lg:px-3">
      <SidebarButton />
      <TextField
        icon="search"
        placeholder="Search prompts, models, LoRAs, seeds…"
        value={ui.q}
        onChange={(e) => ui.set({ q: e.target.value })}
        onClear={() => ui.set({ q: "" })}
        className="w-[340px] max-lg:w-auto max-lg:min-w-0 max-lg:flex-1"
        aria-label="Search images"
      />
      <div className="flex flex-wrap gap-1">
        <FacetChip
          icon="models"
          label="Model"
          value={ui.model}
          options={facets.data?.models}
          onChange={(model) => ui.set({ model })}
        />
        <FacetChip
          icon="layers"
          label="LoRA"
          value={ui.lora}
          options={facets.data?.loras}
          onChange={(lora) => ui.set({ lora })}
        />
        <FacetChip
          icon="tag"
          label="Tag"
          value={ui.tag}
          options={tags.data?.map((t) => ({ name: t.tag, count: t.count }))}
          onChange={(tag) => ui.set({ tag })}
          emptyText="Tag images in the lightbox to filter by them."
        />
        <RatingChip value={ui.rating} onChange={(rating) => ui.set({ rating })} />
        <OriginChip value={ui.origins} onChange={(origins) => ui.set({ origins })} />
        <Chip
          size="sm"
          icon="heart"
          selected={ui.favorites}
          onClick={() => ui.set({ favorites: !ui.favorites })}
        >
          Favorites
        </Chip>
      </div>
      <div className="ml-auto flex items-center gap-2 max-lg:ml-0 max-lg:w-full">
        {total !== null ? (
          <span
            className="font-mono text-xs whitespace-nowrap text-fg-3 tabular max-lg:mr-auto"
            aria-live="polite"
          >
            {total.toLocaleString()} {total === 1 ? "image" : "images"}
          </span>
        ) : null}
        <div className="w-28 max-lg:hidden" title="Tile size">
          <Slider
            value={size}
            onChange={onSize}
            min={120}
            max={400}
            step={10}
            size="sm"
            ariaLabel="Tile size"
          />
        </div>
        <Segmented
          size="sm"
          value={layout}
          onChange={onLayout}
          label="Layout"
          options={[
            { value: "justified", icon: "layout-rows", title: "Justified rows" },
            { value: "grid", icon: "layout-grid", title: "Square grid" },
          ]}
        />
        {ui.sort === "random" ? (
          <IconButton
            icon="shuffle"
            label="Shuffle again"
            size="sm"
            onClick={() => ui.set({ seed: newSeed() })}
          />
        ) : null}
        <Select<GallerySort>
          size="sm"
          value={ui.sort}
          onChange={(sort) => ui.set({ sort })}
          label="Sort"
          className="w-[136px]"
          options={[
            { value: "newest", label: "Newest first", icon: "sort" },
            { value: "oldest", label: "Oldest first", icon: "sort" },
            { value: "name", label: "File name", icon: "text" },
            { value: "rating", label: "Best rated", icon: "star" },
            { value: "random", label: "Shuffled", icon: "shuffle" },
          ]}
        />
      </div>
    </div>
  );
}

/** "★3+" filter: images with at least this many stars. */
/** Which origins show: made here, added from your PC, added from Civitai. */
function OriginChip({
  value,
  onChange,
}: {
  value: ImageOrigin[];
  onChange: (v: ImageOrigin[]) => void;
}) {
  const all = allOrigins(value);
  const only = value.length === 1 ? value[0] : undefined;
  return (
    <Popover
      className="p-3"
      trigger={
        <button
          type="button"
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-sm border px-2.5 text-xs transition-colors focus-ring",
            !all
              ? "border-accent/60 bg-accent/12 text-fg"
              : "border-line bg-field text-fg-2 hover:border-line-strong hover:text-fg",
          )}
        >
          <Icon name={only ? ORIGIN_ICON[only] : "stack"} size={12} />
          {all
            ? "Origin"
            : only
              ? ORIGIN_LABEL[only]
              : value.length
                ? `${value.length} origins`
                : "No origin"}
          <Icon name="chevron-down" size={11} className="text-fg-3" />
        </button>
      }
    >
      {() => (
        <div className="flex flex-col gap-2.5">
          <span className="text-xs text-fg-3">Show images</span>
          {IMAGE_ORIGINS.map((o) => (
            <Checkbox
              key={o}
              checked={value.includes(o)}
              label={ORIGIN_LABEL[o]}
              onCheckedChange={(on) =>
                onChange(IMAGE_ORIGINS.filter((x) => (x === o ? on : value.includes(x))))
              }
            />
          ))}
          {!all ? (
            <button
              type="button"
              onClick={() => onChange([...IMAGE_ORIGINS])}
              className="self-start text-xs text-accent-ink hover:underline focus-ring"
            >
              Show all
            </button>
          ) : null}
        </div>
      )}
    </Popover>
  );
}

function RatingChip({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="p-2"
      trigger={
        <button
          type="button"
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-sm border px-2.5 text-xs transition-colors focus-ring",
            value
              ? "border-accent/60 bg-accent/12 text-fg"
              : "border-line bg-field text-fg-2 hover:border-line-strong hover:text-fg",
          )}
        >
          <Icon
            name="star"
            size={12}
            className={value ? "fill-current text-yellow-ink" : undefined}
          />
          {value ? `${value}+ stars` : "Rating"}
          <Icon name="chevron-down" size={11} className="text-fg-3" />
        </button>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-fg-3">At least</span>
          <StarRating
            value={value}
            onChange={(v) => {
              onChange(v);
              close();
            }}
            label="Minimum rating"
          />
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange(0);
                close();
              }}
              className="self-start text-xs text-accent-ink hover:underline focus-ring"
            >
              Any rating
            </button>
          ) : null}
        </div>
      )}
    </Popover>
  );
}

function FacetChip({
  icon,
  label,
  value,
  options,
  onChange,
  emptyText,
}: {
  icon: IconName;
  label: string;
  value: string | null;
  options: GalleryFacets["models"] | undefined;
  onChange: (v: string | null) => void;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const shown = (options ?? []).filter((o) => o.name.toLowerCase().includes(filter.toLowerCase()));
  if (value)
    return (
      <Chip size="sm" icon={icon} selected onRemove={() => onChange(null)}>
        <span className="max-w-[160px] truncate">{value}</span>
      </Chip>
    );
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="w-72 p-1.5"
      trigger={
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1.5 rounded-sm border border-line bg-field px-2.5 text-xs text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-ring data-[open]:border-accent/60"
        >
          <Icon name={icon} size={12} />
          {label}
          <Icon name="chevron-down" size={11} className="text-fg-3" />
        </button>
      }
    >
      {(close) => (
        <div className="flex flex-col gap-1">
          <TextField
            size="sm"
            icon="search"
            placeholder={`Find a ${label.toLowerCase()}`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
          />
          <div className="scroll-quiet flex max-h-72 flex-col overflow-y-auto">
            {options === undefined ? (
              <span className="px-2 py-3 text-xs text-fg-3">Loading…</span>
            ) : shown.length === 0 ? (
              <span className="px-2 py-3 text-xs text-fg-3">
                {options.length
                  ? "No match."
                  : (emptyText ?? `No images name a ${label.toLowerCase()} yet.`)}
              </span>
            ) : (
              shown.map((o) => (
                <button
                  key={o.name}
                  type="button"
                  onClick={() => {
                    onChange(o.name);
                    close();
                  }}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-sm px-2 text-left text-sm text-fg-2 hover:bg-field hover:text-fg focus-ring",
                  )}
                >
                  <span className="flex-1 truncate">{o.name}</span>
                  <span className="font-mono text-2xs text-fg-3 tabular">
                    {o.count.toLocaleString()}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
