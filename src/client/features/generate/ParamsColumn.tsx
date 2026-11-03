/**
 * The params region, rendered from the layout document (ADR-0005) and the active workflow's
 * bindings. In Customize mode blocks get drag handles (dnd-kit, loaded with Customize from
 * `SortableParams`), a click selects one, and the Inspector edits its style. Controls are inert
 * while customizing so a click always means "select this block".
 */

import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import {
  Collapsible,
  SectionTitle,
  type SliderLook,
  SliderLookContext,
  type TabItem,
  Tabs,
} from "@client/ui";
import {
  allBlocks,
  type Block,
  type CardBlock,
  type ParamBlock,
  type TabsBlock,
} from "@shared/layout/schema";
import { type Binding, resolveBind } from "@shared/workflow/manifest";
import type { StageId } from "@shared/workflow/roles";
import { STAGE_LABELS } from "@shared/workflow/stages";
import { type ComponentType, lazy, type ReactNode, Suspense, useState } from "react";
import { bindingFamily, defaultStyle, ParamControl } from "./blocks/ParamControl";
import { Resolution } from "./blocks/Resolution";
import { ScriptsBlock } from "./blocks/Scripts";
import { Seed } from "./blocks/Seed";
import { AdetailerStage, ControlNetStage, HiresStage, StageTabContext } from "./blocks/stages";
import { useLayout, useValues } from "./state";
import { useBindings } from "./workflow";

const SortableParams = lazy(() => import("./SortableParams"));

/** The params' sliders: a little bigger, with the value in a number box (the old app's look). */
const PARAMS_SLIDERS: SliderLook = { size: "lg", field: true };

/** Roles rendered by feature blocks (prompts, models strip, seed, resolution), not by params-rest. */
const FEATURE_ROLES = new Set([
  "prompt.positive",
  "prompt.negative",
  "model.checkpoint",
  "model.unet",
  "model.vae",
  "model.clip",
  "model.clip2",
  "lora.stack",
  "sampler.seed",
  "latent.width",
  "latent.height",
  "latent.batch",
  "output.image",
]);

export interface ArrangeItemProps {
  block: Block;
  children: ReactNode;
  /** Grid columns (of 12) inside a card. */
  span?: number;
  /** Inside a card: a smaller label chip. */
  compact?: boolean;
}
export interface ArrangeGroupProps {
  ids: string[];
  children: ReactNode;
}
/** How blocks are wrapped: plain, or sortable with handles while customizing. */
export interface Arrange {
  Item: ComponentType<ArrangeItemProps>;
  Group: ComponentType<ArrangeGroupProps>;
}

function PlainItem({ span, children }: ArrangeItemProps) {
  if (!children) return null;
  return (
    <div style={{ gridColumn: span ? `span ${span} / span ${span}` : undefined }}>{children}</div>
  );
}

function PlainGroup({ children }: ArrangeGroupProps) {
  return children;
}

const PLAIN: Arrange = { Item: PlainItem, Group: PlainGroup };

function placedBindingIds(blocks: Block[], bindings: Binding[]): Set<string> {
  const out = new Set<string>();
  for (const b of allBlocks(blocks)) {
    if (b.type !== "param") continue;
    const found = resolveBind(bindings, b.bind);
    if (found) out.add(found.id);
  }
  return out;
}

interface RenderContext {
  bindings: Binding[];
  placed: Set<string>;
  customizing: boolean;
  /** A batch workflow: its input image comes from the runner, and Generate-only blocks hide. */
  batch: boolean;
  /** Rendering a card's children: feature blocks leave out their own card. */
  inCard?: boolean;
  arrange: Arrange;
}

/** Blocks that only mean something for Generate (not for a batch workflow). */
function generateOnly(block: Block): boolean {
  return (
    block.type === "stage" ||
    (block.type === "feature" && ["scripts", "resolution", "seed"].includes(block.feature))
  );
}

function RestBlock({ title, ctx }: { title: string; ctx: RenderContext }) {
  const rest = ctx.bindings.filter(
    (b) =>
      !b.hidden &&
      !ctx.placed.has(b.id) &&
      !(b.role && FEATURE_ROLES.has(b.role)) &&
      !(ctx.batch && b.role === "image.input"),
  );
  if (!rest.length)
    return ctx.customizing ? <Ghost text="Nothing else to show for this workflow" /> : null;
  return (
    <Collapsible
      tone="base"
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
              control: defaultStyle(bindingFamily(b)),
            }}
          />
        ))}
        <p className="flex items-start gap-1.5 text-2xs text-fg-3">
          <Icon name="info" size={12} className="mt-px" />
          Found in the workflow (nodes titled with $ in ComfyUI). Move them anywhere with Customize.
        </p>
      </div>
    </Collapsible>
  );
}

/** Stage blocks (ADR-0004): graph patches spliced in at role ports when they're on. */
function StageBlock({ stage }: { stage: StageId }) {
  if (stage === "hires") return <HiresStage />;
  if (stage === "adetailer") return <AdetailerStage />;
  if (stage === "controlnet") return <ControlNetStage />;
  // Upscale has no package yet; nothing to show.
  return null;
}

function renderBlock(block: Block, ctx: RenderContext): ReactNode {
  if (ctx.batch && generateOnly(block)) return null;
  switch (block.type) {
    case "param": {
      const b = resolveBind(ctx.bindings, block.bind);
      if (b) return <ParamControl binding={b} block={block} />;
      // A block for a parameter this workflow doesn't have: a ghost while customizing, else nothing.
      return ctx.customizing ? (
        <Ghost text={`No ${block.bind.replace(/^(role|id):/, "")} in this workflow`} />
      ) : null;
    }
    case "card":
      return <Card block={block} ctx={ctx} />;
    case "tabs":
      return <PassTabs block={block} ctx={ctx} />;
    case "feature":
      if (block.feature === "resolution") return <Resolution bare={ctx.inCard} />;
      if (block.feature === "seed") return <Seed bare={ctx.inCard} />;
      if (block.feature === "scripts") return <ScriptsBlock />;
      return null;
    case "stage":
      return <StageBlock stage={block.stage} />;
    case "params-rest":
      return <RestBlock title={block.title ?? "More from this workflow"} ctx={ctx} />;
  }
}

function Ghost({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-line px-3 py-2 text-xs text-fg-4">
      {text}
    </div>
  );
}

/** A card's children on screen: ones whose parameter the workflow lacks take no space outside
 * Customize. */
function cardChildren(block: CardBlock, ctx: RenderContext) {
  return block.children.filter(
    (c) =>
      ctx.customizing || (!c.hidden && (c.type !== "param" || resolveBind(ctx.bindings, c.bind))),
  );
}

function CardGrid({ block, ctx }: { block: CardBlock; ctx: RenderContext }) {
  const { Item, Group } = ctx.arrange;
  const visible = cardChildren(block, ctx);
  return (
    <Group ids={visible.map((c) => c.id)}>
      <div
        className={cn("grid grid-cols-12 gap-x-3", ctx.customizing ? "gap-y-6 pt-3" : "gap-y-3.5")}
      >
        {visible.map((child) => (
          <Item key={child.id} block={child} span={child.span ?? 12} compact>
            {renderBlock(child, { ...ctx, inCard: true })}
          </Item>
        ))}
      </div>
    </Group>
  );
}

function Card({ block, ctx }: { block: CardBlock; ctx: RenderContext }) {
  if (!cardChildren(block, ctx).length && !ctx.customizing) return null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
      <SectionTitle icon={(block.icon as IconName) ?? "sliders"}>{block.title}</SectionTitle>
      <CardGrid block={block} ctx={ctx} />
    </div>
  );
}

type PassBlock = TabsBlock["children"][number];

/** Stages a tab can turn on and off (upscale has no package yet). */
const TAB_STAGES = ["controlnet", "hires", "adetailer"] as const;
type TabStage = (typeof TAB_STAGES)[number];
const isTabStage = (stage: StageId): stage is TabStage =>
  (TAB_STAGES as readonly string[]).includes(stage);

/** The passes one at a time (the old app's First Pass | ControlNet | Hires. fix | ADetailer);
 * Customize stacks them so each can be moved and edited. */
function PassTabs({ block, ctx }: { block: TabsBlock; ctx: RenderContext }) {
  const passes = block.children.filter(
    (c) =>
      (ctx.customizing || !c.hidden) &&
      !(ctx.batch && generateOnly(c)) &&
      (c.type === "card"
        ? ctx.customizing || cardChildren(c, ctx).length > 0
        : isTabStage(c.stage)),
  );
  if (ctx.customizing) {
    const { Item, Group } = ctx.arrange;
    return (
      <Group ids={passes.map((c) => c.id)}>
        <div className="flex flex-col gap-5 rounded-lg border border-dashed border-line p-2 pt-5">
          {passes.map((c) => (
            <Item key={c.id} block={c}>
              {renderBlock(c, ctx)}
            </Item>
          ))}
        </div>
      </Group>
    );
  }
  if (passes.length <= 1) return passes[0] ? renderBlock(passes[0], ctx) : null;
  return <PassTabsView passes={passes} ctx={ctx} />;
}

function PassTabsView({ passes, ctx }: { passes: PassBlock[]; ctx: RenderContext }) {
  const [picked, setPicked] = useState<string | null>(null);
  const on = {
    controlnet: useValues((s) => s.stages.controlnet.enabled),
    hires: useValues((s) => s.stages.hires.enabled),
    adetailer: useValues((s) => s.stages.adetailer.enabled),
  };
  const setOn = (stage: TabStage, enabled: boolean) => {
    const { stages, setStage } = useValues.getState();
    setStage(stage, { ...stages[stage], enabled });
  };
  const active = passes.find((p) => p.id === picked) ?? (passes[0] as PassBlock);
  const items: TabItem<string>[] = passes.map((p) => {
    if (p.type === "card") return { value: p.id, label: p.title };
    const stage = p.stage as TabStage;
    return {
      value: p.id,
      label: STAGE_LABELS[stage],
      checked: on[stage],
      onCheckedChange: (v: boolean) => setOn(stage, v),
    };
  });
  return (
    <div className="flex flex-col">
      <Tabs variant="line" items={items} value={active.id} onChange={setPicked} label="Passes" />
      <div className="pt-3">
        {active.type === "card" ? (
          <CardGrid block={active} ctx={ctx} />
        ) : (
          <StageTabContext.Provider value={true}>
            <StageBlock stage={active.stage} />
          </StageTabContext.Provider>
        )}
      </div>
    </div>
  );
}

function BlockList({ visible, ctx }: { visible: Block[]; ctx: RenderContext }) {
  const { Item } = ctx.arrange;
  return (
    <div className={cn("flex flex-col", ctx.customizing ? "gap-5 pt-2" : "gap-2.5")}>
      {visible.map((b) => (
        <Item key={b.id} block={b}>
          {renderBlock(b, ctx)}
        </Item>
      ))}
    </div>
  );
}

export function ParamsColumn({ batch = false }: { batch?: boolean }) {
  const doc = useLayout((s) => s.doc);
  const customizing = useLayout((s) => s.customizing);
  const bindings = useBindings();
  const blocks = doc?.regions.params ?? [];
  const ctx: RenderContext = {
    bindings,
    placed: placedBindingIds(blocks, bindings),
    customizing,
    batch,
    arrange: PLAIN,
  };
  const visible = blocks.filter((b) => (customizing || !b.hidden) && !(batch && generateOnly(b)));
  const plain = <BlockList visible={visible} ctx={ctx} />;

  return (
    <SliderLookContext.Provider value={PARAMS_SLIDERS}>
      <div className="min-w-0">
        {customizing ? (
          // While dnd-kit loads (the first Customize only), the blocks show without handles.
          <Suspense fallback={plain}>
            <SortableParams blocks={blocks} ids={visible.map((b) => b.id)}>
              {(arrange) => <BlockList visible={visible} ctx={{ ...ctx, arrange }} />}
            </SortableParams>
          </Suspense>
        ) : (
          plain
        )}
        <div className="h-6" />
      </div>
    </SliderLookContext.Provider>
  );
}

export type { ParamBlock };
