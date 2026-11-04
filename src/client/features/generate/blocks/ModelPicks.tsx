/**
 * Models picked as tiles (an XY plot's checkpoint, VAE, text encoder or LoRA axis): each pick is
 * a small picture tile you can remove (its picture opens the gallery too), and the + tile opens a smaller model gallery (the pickers'
 * own grid, with its folders, search, base models and sort) where clicks pick and unpick without
 * closing it. Picks keep the order they were picked in; drag a tile (or Alt+← / Alt+→ on it) to
 * change it, which is the order across or down the grid.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useSettings } from "@client/lib/queries";
import { Button, Dialog, FallbackFace, Tooltip } from "@client/ui";
import type { ModelKind } from "@shared/constants";
import { useState } from "react";
import { useModelThumb } from "../../models/thumbs";
import { modelDisplayName } from "../labels";
import { ModelGrid } from "../ModelGrid";
import { DropMarker, moveItem, NO_DRAG, type Sortable, useSortableRow } from "../sortable";

export function ModelPicks({
  kind,
  value,
  onChange,
  label,
  title,
}: {
  kind: ModelKind;
  value: string[];
  onChange: (value: string[]) => void;
  /** What's picked ("X values"), for the + tile. */
  label: string;
  /** The gallery's title ("X values · Checkpoint"). */
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const sortable = useSortableRow(value.length, (from, to) => onChange(moveItem(value, from, to)));
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {value.map((name, i) => (
        <PickTile
          key={name}
          kind={kind}
          name={name}
          sortable={sortable(i)}
          onOpen={() => setOpen(true)}
          onRemove={() => onChange(value.filter((v) => v !== name))}
        />
      ))}
      <button
        type="button"
        aria-label={`Add to ${label}`}
        onClick={() => setOpen(true)}
        className="grid aspect-[2/3] w-16 shrink-0 place-items-center rounded-lg border border-dashed border-line-strong text-fg-3 transition-colors hover:border-fg-3 hover:text-fg-2 focus-ring"
      >
        <Icon name="plus" size={18} />
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        width={1240}
        footer={
          <>
            <span className="mr-auto text-sm text-fg-3 tabular">{value.length} picked</span>
            <Button variant="ghost" disabled={!value.length} onClick={() => onChange([])}>
              Clear
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        {open ? (
          <ModelGrid
            tab={kind === "loras" ? "loras" : "other"}
            picks={{ kind, value, onChange }}
            className="h-[min(68svh,760px)] min-h-[360px]"
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function PickTile({
  kind,
  name,
  sortable,
  onOpen,
  onRemove,
}: {
  kind: ModelKind;
  name: string;
  sortable: Sortable;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { thumb, nsfw } = useModelThumb(kind, name);
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  const shown = modelDisplayName(name);
  return (
    // The drop line sits outside the clipped picture.
    <div
      {...sortable.drag}
      className={cn(
        "group relative aspect-[2/3] w-16 shrink-0 cursor-grab rounded-lg border border-line bg-sunken active:cursor-grabbing",
        sortable.dragging && "opacity-30",
      )}
    >
      <DropMarker at={sortable.marker} />
      <Tooltip content={name}>
        {/* The picture opens the gallery; Alt+← / Alt+→ on it moves the tile. */}
        <button
          type="button"
          onClick={onOpen}
          onKeyDown={sortable.onKeyDown}
          aria-label={shown}
          aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
          className="absolute inset-0 block cursor-[inherit] overflow-hidden rounded-[inherit] focus-ring"
        >
          {thumb && !(nsfw && blurNsfw) ? (
            <img
              src={thumb}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <FallbackFace kind={kind} className="absolute inset-0" />
          )}
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-1 py-0.5 text-left text-2xs text-white">
            {shown}
          </span>
        </button>
      </Tooltip>
      {/* A plain button: IconButton's own `relative` would beat `absolute` (like ModelCard's corners). */}
      <button
        type="button"
        {...{ [NO_DRAG]: "" }}
        aria-label={`Remove ${shown}`}
        onClick={onRemove}
        className="absolute top-1 right-1 z-10 grid h-6 w-6 place-items-center rounded-xs bg-black/75 text-white/85 opacity-0 transition-opacity hover:text-white focus-ring group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
      >
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}
