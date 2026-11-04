/**
 * Models picked as tiles (an XY plot's checkpoint, VAE, text encoder or LoRA axis): each pick is
 * a small picture tile you can remove, and the + tile opens a searchable list where clicks pick
 * and unpick without closing it. Picks keep the order they were picked in.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useSettings } from "@client/lib/queries";
import { FallbackFace, Popover, TextField, Tooltip, Veil } from "@client/ui";
import type { ModelKind } from "@shared/constants";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { useModelThumb } from "../../models/thumbs";
import { modelDisplayName } from "../labels";

const ROW = 44;

export function ModelPicks({
  kind,
  options,
  value,
  onChange,
  label,
}: {
  kind: ModelKind;
  /** ComfyUI names to pick from. */
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  /** What's picked ("X values"), for the + tile and the list. */
  label: string;
}) {
  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]);
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {value.map((name) => (
        <PickTile
          key={name}
          kind={kind}
          name={name}
          onRemove={() => onChange(value.filter((v) => v !== name))}
        />
      ))}
      <Popover
        placement="bottom-start"
        className="w-80 p-2"
        trigger={
          <button
            type="button"
            aria-label={`Add to ${label}`}
            className="grid aspect-[2/3] w-16 shrink-0 place-items-center rounded-lg border border-dashed border-line-strong text-fg-3 transition-colors hover:border-fg-3 hover:text-fg-2 focus-ring"
          >
            <Icon name="plus" size={18} />
          </button>
        }
      >
        <PickList kind={kind} options={options} value={value} onToggle={toggle} label={label} />
      </Popover>
    </div>
  );
}

function PickTile({
  kind,
  name,
  onRemove,
}: {
  kind: ModelKind;
  name: string;
  onRemove: () => void;
}) {
  const { thumb, nsfw } = useModelThumb(kind, name);
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  return (
    <Tooltip content={name}>
      <div className="group relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-sunken">
        {thumb ? (
          <Veil active={nsfw && blurNsfw} compact className="absolute inset-0">
            <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} />
          </Veil>
        ) : (
          <FallbackFace kind={kind} className="absolute inset-0" />
        )}
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-1 py-0.5 text-2xs text-white">
          {modelDisplayName(name)}
        </span>
        {/* A plain button: IconButton's own `relative` would beat `absolute` (like ModelCard's corners). */}
        <button
          type="button"
          aria-label={`Remove ${modelDisplayName(name)}`}
          onClick={onRemove}
          className="absolute top-1 right-1 z-10 grid h-6 w-6 place-items-center rounded-xs bg-black/75 text-white/85 opacity-0 transition-opacity hover:text-white focus-ring group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
        >
          <Icon name="x" size={13} />
        </button>
      </div>
    </Tooltip>
  );
}

function PickList({
  kind,
  options,
  value,
  onToggle,
  label,
}: {
  kind: ModelKind;
  options: string[];
  value: string[];
  onToggle: (name: string) => void;
  label: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => (q ? options.filter((o) => o.toLowerCase().includes(q)) : options),
    [options, q],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: shown.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW,
    overscan: 8,
  });
  return (
    <div className="flex flex-col gap-2">
      <TextField
        size="sm"
        icon="search"
        autoFocus
        aria-label={`Search ${label}`}
        placeholder="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onClear={() => setQuery("")}
      />
      {shown.length ? (
        <div
          ref={scroller}
          role="listbox"
          aria-multiselectable
          aria-label={label}
          className="scroll-quiet h-72 overflow-auto"
        >
          <div className="relative" style={{ height: virtual.getTotalSize() }}>
            {virtual.getVirtualItems().map((row) => {
              const name = shown[row.index] as string;
              return (
                <PickRow
                  key={name}
                  kind={kind}
                  name={name}
                  picked={value.includes(name)}
                  onToggle={() => onToggle(name)}
                  top={row.start}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <p className="px-1 py-6 text-center text-xs text-fg-3">
          {options.length ? "Nothing matches the search." : "No models found. Start ComfyUI."}
        </p>
      )}
    </div>
  );
}

function PickRow({
  kind,
  name,
  picked,
  onToggle,
  top,
}: {
  kind: ModelKind;
  name: string;
  picked: boolean;
  onToggle: () => void;
  top: number;
}) {
  const { thumb, nsfw } = useModelThumb(kind, name);
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  const slash = name.replace(/\\/g, "/").lastIndexOf("/");
  return (
    <button
      type="button"
      role="option"
      aria-selected={picked}
      onClick={onToggle}
      style={{ top, height: ROW }}
      className={cn(
        "absolute inset-x-0 flex items-center gap-2 rounded-md px-1.5 text-left focus-ring",
        picked ? "bg-green/15" : "hover:bg-field",
      )}
    >
      <span className="relative h-9 w-6 shrink-0 overflow-hidden rounded-xs bg-sunken">
        {thumb && !(nsfw && blurNsfw) ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <FallbackFace kind={kind} className="absolute inset-0" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-fg">{modelDisplayName(name)}</span>
        {slash > 0 ? (
          <span className="truncate text-2xs text-fg-3">{name.slice(0, slash)}</span>
        ) : null}
      </span>
      {picked ? <Icon name="check" size={14} className="shrink-0 text-green-ink" /> : null}
    </button>
  );
}
