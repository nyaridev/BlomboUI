/**
 * Customize mode's drag and drop for the params region (lib/sortable.ts): ParamsColumn renders the
 * same blocks through plain wrappers otherwise. Blocks get a drag handle and a label chip, and a
 * click anywhere on one selects it for the Inspector. A block swaps with the others of its list
 * (the top level, or a card's or tabs' children) as you drag it past them; one drag is one undo.
 */

import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { ALT_ARROWS, DRAG_LIFT, type Sortable, useSortableRow } from "@client/lib/sortable";
import { allBlocks, type Block, blockChildren } from "@shared/layout/schema";
import { createContext, type ReactNode, useContext } from "react";
import { blockLabel } from "./blockLabel";
import type { Arrange, ArrangeGroupProps, ArrangeItemProps } from "./ParamsColumn";
import { useLayout } from "./state";
import { useBindings } from "./workflow";

type MoveBlock = (id: string, overId: string, merge: boolean) => void;
const MoveContext = createContext<MoveBlock>(() => {});
/** The sorter of the list a block is in (the nearest group's, else the top level's). */
const SortContext = createContext<(id: string) => Sortable | null>(() => null);

/** A sorter for one list of block ids. */
function SortList({ ids, children }: { ids: string[]; children: ReactNode }) {
  const moveBlock = useContext(MoveContext);
  const row = useSortableRow(ids.length, (from, to, more) => {
    const a = ids[from];
    const o = ids[to];
    if (a && o) moveBlock(a, o, more);
  });
  const get = (id: string) => {
    const i = ids.indexOf(id);
    return i < 0 ? null : row(i);
  };
  return <SortContext.Provider value={get}>{children}</SortContext.Provider>;
}

function SortableItem({ block, children, span, compact }: ArrangeItemProps) {
  const selected = useLayout((s) => s.selected === block.id);
  const select = useLayout((s) => s.select);
  const bindings = useBindings();
  const sortable = useContext(SortContext)(block.id);
  const { label, icon } = blockLabel(block, bindings);
  // A group (card, tabs) is a container: it's selected through its label chip, and its
  // children stay individually selectable. Every other block is selected by clicking on it.
  const container = block.type === "card" || block.type === "tabs";
  return (
    <div
      ref={sortable?.ref}
      style={{ gridColumn: span ? `span ${span} / span ${span}` : undefined }}
      className={cn(
        "group/blk relative rounded-lg outline-1 transition-[outline-color,scale,box-shadow]",
        compact ? "outline-offset-2" : "outline-offset-4",
        selected
          ? "outline-2 outline-accent-ink"
          : "outline-dashed outline-line-strong hover:outline-fg-4",
        sortable?.dragging && cn(DRAG_LIFT, "bg-surface"),
        block.hidden && "opacity-40",
      )}
    >
      <div
        className={cn(
          "absolute z-10 flex items-center gap-1 rounded-xs border bg-surface-3 pr-1.5 font-medium",
          compact ? "-top-4 right-0 h-4 text-[9.5px]" : "-top-2.5 left-2 h-5 text-[10px]",
          selected ? "border-accent-ink text-fg" : "border-line-strong text-fg-3",
        )}
      >
        <button
          type="button"
          aria-label={`Drag ${label}`}
          aria-keyshortcuts={ALT_ARROWS}
          {...sortable?.handle}
          onKeyDown={sortable?.onKeyDown}
          className="grid h-full w-4 cursor-grab touch-none place-items-center text-fg-3 active:cursor-grabbing"
        >
          <Icon name="grip" size={11} />
        </button>
        <button
          type="button"
          onClick={() => select(block.id)}
          className="flex items-center gap-1 hover:text-fg"
          aria-label={`Select ${label}`}
        >
          <Icon name={icon} size={10} />
          <span className={cn("max-w-[140px] truncate", compact && "max-w-[90px]")}>{label}</span>
          {block.hidden ? <Icon name="eye-off" size={10} /> : null}
        </button>
      </div>
      {container ? (
        children
      ) : (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={(e) => {
              e.stopPropagation();
              select(block.id);
            }}
            className="absolute inset-0 z-[5] cursor-pointer rounded-lg"
          />
          <div className="pointer-events-none select-none">{children}</div>
        </>
      )}
    </div>
  );
}

/** A group's children sort within the group (a card's grid, the stacked tabs). */
function SortableGroup({ ids, children }: ArrangeGroupProps) {
  return <SortList ids={ids}>{children}</SortList>;
}

const SORTABLE: Arrange = { Item: SortableItem, Group: SortableGroup };

export default function SortableParams({
  blocks,
  ids,
  children,
}: {
  /** Every top-level block (cards included), for working out what moved where. */
  blocks: Block[];
  /** The top-level blocks on screen, in order. */
  ids: string[];
  children: (arrange: Arrange) => ReactNode;
}) {
  const moveParams = useLayout((s) => s.moveParams);
  const moveIn = useLayout((s) => s.moveIn);
  // Ids are matched in the full lists, hidden blocks included.
  const moveBlock: MoveBlock = (a, o, merge) => {
    const top = blocks.map((b) => b.id);
    if (top.includes(a) && top.includes(o)) {
      moveParams(top.indexOf(a), top.indexOf(o), merge);
      return;
    }
    for (const group of allBlocks(blocks)) {
      const childIds = blockChildren(group).map((c) => c.id);
      if (childIds.includes(a) && childIds.includes(o)) {
        moveIn(group.id, childIds.indexOf(a), childIds.indexOf(o), merge);
        return;
      }
    }
  };

  return (
    <MoveContext.Provider value={moveBlock}>
      <SortList ids={ids}>{children(SORTABLE)}</SortList>
    </MoveContext.Provider>
  );
}
