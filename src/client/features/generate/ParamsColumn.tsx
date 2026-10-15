/**
 * The params region, rendered from the layout document (ADR-0005). In Customize mode blocks get
 * drag handles (dnd-kit), a click selects one, and the Inspector edits its style. Controls are
 * inert while customizing so a click always means "select this block".
 */

import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { Collapsible, SectionTitle } from "@client/ui";
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
import type { Block, CardBlock, ParamBlock } from "@shared/layout/schema";
import { controlFamily } from "@shared/layout/schema";
import { type Binding, resolveBind } from "@shared/workflow/manifest";
import type { ReactNode } from "react";
import { defaultStyle, ParamControl } from "./blocks/ParamControl";
import { Resolution } from "./blocks/Resolution";
import { Seed } from "./blocks/Seed";
import { AdetailerStage, ControlNetStage, HiresStage } from "./blocks/Stages";
import { PREVIEW_BINDINGS } from "./preview-workflow";
import { useLayout } from "./state";

/** Roles rendered by feature blocks (prompts, models strip, seed, resolution), not by params-rest. */
const FEATURE_ROLES = new Set([
  "prompt.positive",
  "prompt.negative",
  "model.checkpoint",
  "model.unet",
  "model.vae",
  "model.clip",
  "sampler.seed",
  "latent.width",
  "latent.height",
  "latent.batch",
]);

export function blockLabel(
  block: Block,
  bindings: Binding[] = PREVIEW_BINDINGS,
): { label: string; icon: IconName } {
  switch (block.type) {
    case "param": {
      const b = resolveBind(bindings, block.bind);
      return { label: block.title ?? b?.label ?? block.bind, icon: "sliders" };
    }
    case "card":
      return { label: block.title, icon: "layout-grid" };
    case "stage":
      return {
        label: {
          hires: "Hires fix",
          adetailer: "ADetailer",
          controlnet: "ControlNet",
          upscale: "Upscale",
        }[block.stage],
        icon: { hires: "upscale", adetailer: "face-scan", controlnet: "pose", upscale: "upscale" }[
          block.stage
        ] as IconName,
      };
    case "params-rest":
      return { label: block.title ?? "More from this workflow", icon: "workflow" };
    case "feature":
      return {
        label:
          { resolution: "Size", seed: "Seed & batch" }[block.feature as "resolution" | "seed"] ??
          block.feature,
        icon: block.feature === "resolution" ? "aspect-ratio" : "seed",
      };
  }
}

function placedBindingIds(blocks: Block[]): Set<string> {
  const out = new Set<string>();
  const visit = (b: Block) => {
    if (b.type === "param") {
      const found = resolveBind(PREVIEW_BINDINGS, b.bind);
      if (found) out.add(found.id);
    }
    if (b.type === "card") b.children.forEach(visit);
  };
  blocks.forEach(visit);
  return out;
}

function RestBlock({ title, placed }: { title: string; placed: Set<string> }) {
  const rest = PREVIEW_BINDINGS.filter(
    (b) => !b.hidden && !placed.has(b.id) && !(b.role && FEATURE_ROLES.has(b.role)),
  );
  if (!rest.length) return null;
  return (
    <Collapsible
      title={title}
      icon="workflow"
      subtitle={`${rest.length} inputs found in the graph`}
    >
      <div className="flex flex-col gap-3">
        {rest.map((b) => (
          <ParamControl
            key={b.id}
            binding={b}
            block={{
              type: "param",
              id: `rest-${b.id}`,
              bind: `id:${b.id}`,
              control: defaultStyle(controlFamily(b.type)),
            }}
          />
        ))}
        <p className="flex items-start gap-1.5 text-2xs text-fg-3">
          <Icon name="info" size={12} className="mt-px" />
          Detected from the workflow (nodes titled with $). Move them anywhere with Customize.
        </p>
      </div>
    </Collapsible>
  );
}

function renderBlock(block: Block, placed: Set<string>, customizing: boolean): ReactNode {
  switch (block.type) {
    case "param": {
      const b = resolveBind(PREVIEW_BINDINGS, block.bind);
      return b ? (
        <ParamControl binding={b} block={block} />
      ) : (
        <Ghost text={`No ${block.bind.slice(5)} in this workflow`} />
      );
    }
    case "card":
      return <Card block={block} placed={placed} customizing={customizing} />;
    case "feature":
      if (block.feature === "resolution") return <Resolution />;
      if (block.feature === "seed") return <Seed />;
      return null;
    case "stage":
      if (block.stage === "hires") return <HiresStage />;
      if (block.stage === "adetailer") return <AdetailerStage />;
      if (block.stage === "controlnet") return <ControlNetStage />;
      return null;
    case "params-rest":
      return <RestBlock title={block.title ?? "More from this workflow"} placed={placed} />;
  }
}

function Ghost({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-line px-3 py-2 text-xs text-fg-4">
      {text}
    </div>
  );
}

function Card({
  block,
  placed,
  customizing,
}: {
  block: CardBlock;
  placed: Set<string>;
  customizing: boolean;
}) {
  const visible = block.children.filter((c) => customizing || !c.hidden);
  const grid = (
    <div className={cn("grid grid-cols-12 gap-x-3", customizing ? "gap-y-6 pt-3" : "gap-y-3.5")}>
      {visible.map((child) => (
        <Sortable
          key={child.id}
          block={child}
          customizing={customizing}
          span={child.span ?? 12}
          compact
        >
          {renderBlock(child, placed, customizing)}
        </Sortable>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3">
      <SectionTitle icon={(block.icon as IconName) ?? "sliders"}>{block.title}</SectionTitle>
      {customizing ? (
        <SortableContext items={visible.map((c) => c.id)} strategy={rectSortingStrategy}>
          {grid}
        </SortableContext>
      ) : (
        grid
      )}
    </div>
  );
}

function Sortable({
  block,
  customizing,
  children,
  span,
  compact,
}: {
  block: Block;
  customizing: boolean;
  children: ReactNode;
  span?: number;
  compact?: boolean;
}) {
  const selected = useLayout((s) => s.selected === block.id);
  const select = useLayout((s) => s.select);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    disabled: !customizing,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    gridColumn: span ? `span ${span} / span ${span}` : undefined,
  };
  if (!customizing) return <div style={style}>{children}</div>;
  const { label, icon } = blockLabel(block);
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

export function ParamsColumn() {
  const doc = useLayout((s) => s.doc);
  const customizing = useLayout((s) => s.customizing);
  const moveParams = useLayout((s) => s.moveParams);
  const moveInCard = useLayout((s) => s.moveInCard);
  const blocks = doc.regions.params;
  const placed = placedBindingIds(blocks);
  const visible = blocks.filter((b) => customizing || !b.hidden);
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
      const ids = card.children.map((c) => c.id);
      moveInCard(card.id, ids.indexOf(a), ids.indexOf(o));
    }
  };

  const list = (
    <div className={cn("flex flex-col", customizing ? "gap-5 pt-2" : "gap-2.5")}>
      {visible.map((b) => (
        <Sortable key={b.id} block={b} customizing={customizing}>
          {renderBlock(b, placed, customizing)}
        </Sortable>
      ))}
    </div>
  );

  return (
    <div className="scroll-quiet h-full overflow-y-auto pr-1.5" style={{ width: doc.sizes.params }}>
      {customizing ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            {list}
          </SortableContext>
        </DndContext>
      ) : (
        list
      )}
      <div className="h-6" />
    </div>
  );
}

export type { ParamBlock };
