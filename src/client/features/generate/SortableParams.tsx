/**
 * Customize mode's drag and drop for the params region (dnd-kit). Loaded only when Customize
 * opens, so dnd-kit stays out of the Generate screen's first load; ParamsColumn renders the
 * same blocks through plain wrappers otherwise. Blocks get a drag handle and a label chip, and
 * a click anywhere on one selects it for the Inspector.
 */

import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block, CardBlock } from "@shared/layout/schema";
import type { ReactNode } from "react";
import { blockLabel } from "./blockLabel";
import type { Arrange, ArrangeGroupProps, ArrangeItemProps } from "./ParamsColumn";
import { useLayout } from "./state";
import { useBindings } from "./workflow";

function SortableItem({ block, children, span, compact }: ArrangeItemProps) {
  const selected = useLayout((s) => s.selected === block.id);
  const select = useLayout((s) => s.select);
  const bindings = useBindings();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    gridColumn: span ? `span ${span} / span ${span}` : undefined,
  };
  const { label, icon } = blockLabel(block, bindings);
  // A card is a container: it's selected through its label chip, and its children stay
  // individually selectable. Every other block is selected by clicking anywhere on it.
  const container = block.type === "card";
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/blk relative rounded-lg outline-1 transition-[outline-color]",
        compact ? "outline-offset-2" : "outline-offset-4",
        selected
          ? "outline-2 outline-accent-ink"
          : "outline-dashed outline-line-strong hover:outline-fg-4",
        isDragging && "z-20 opacity-80 shadow-pop",
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
          className="grid h-full w-4 cursor-grab place-items-center text-fg-3 active:cursor-grabbing"
          {...attributes}
          {...listeners}
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

/** A card's children sort within the card's grid. */
function SortableGroup({ ids, children }: ArrangeGroupProps) {
  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      {children}
    </SortableContext>
  );
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
  const moveInCard = useLayout((s) => s.moveInCard);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const a = String(e.active.id);
    const o = e.over ? String(e.over.id) : null;
    if (!o || a === o) return;
    const top = blocks.map((b) => b.id);
    if (top.includes(a) && top.includes(o)) {
      moveParams(top.indexOf(a), top.indexOf(o));
      return;
    }
    const card = blocks.find(
      (b): b is CardBlock =>
        b.type === "card" &&
        b.children.some((c) => c.id === a) &&
        b.children.some((c) => c.id === o),
    );
    if (card) {
      const childIds = card.children.map((c) => c.id);
      moveInCard(card.id, childIds.indexOf(a), childIds.indexOf(o));
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children(SORTABLE)}
      </SortableContext>
    </DndContext>
  );
}
