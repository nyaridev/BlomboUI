/**
 * The params region, rendered from the layout document (ADR-0005) and the active workflow's
 * bindings. In Customize mode blocks get drag handles (dnd-kit, loaded with Customize from
 * `SortableParams`), a click selects one, and the Inspector edits its style. Controls are inert
 * while customizing so a click always means "select this block".
 */

import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { Collapsible, SectionTitle } from "@client/ui";
import type { Block, CardBlock, ParamBlock } from "@shared/layout/schema";
import { type Binding, resolveBind } from "@shared/workflow/manifest";
import type { StageId } from "@shared/workflow/roles";
import { type ComponentType, lazy, type ReactNode, Suspense } from "react";
import { bindingFamily, defaultStyle, ParamControl } from "./blocks/ParamControl";
import { Resolution } from "./blocks/Resolution";
import { ScriptsBlock } from "./blocks/Scripts";
import { Seed } from "./blocks/Seed";
import { AdetailerStage, ControlNetStage, HiresStage } from "./blocks/stages";
import { useLayout } from "./state";
import { useBindings } from "./workflow";

const SortableParams = lazy(() => import("./SortableParams"));

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
  const visit = (b: Block) => {
    if (b.type === "param") {
      const found = resolveBind(bindings, b.bind);
      if (found) out.add(found.id);
    }
    if (b.type === "card") b.children.forEach(visit);
  };
  blocks.forEach(visit);
  return out;
}

interface RenderContext {
  bindings: Binding[];
  placed: Set<string>;
  customizing: boolean;
  /** A batch workflow: its input image comes from the runner, and Generate-only blocks hide. */
  batch: boolean;
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
    case "feature":
      if (block.feature === "resolution") return <Resolution />;
      if (block.feature === "seed") return <Seed />;
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

function Card({ block, ctx }: { block: CardBlock; ctx: RenderContext }) {
  const { customizing, bindings } = ctx;
  const { Item, Group } = ctx.arrange;
  // Children whose parameter the workflow lacks take no space outside Customize.
  const visible = block.children.filter(
    (c) => customizing || (!c.hidden && (c.type !== "param" || resolveBind(bindings, c.bind))),
  );
  if (!visible.length && !customizing) return null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3">
      <SectionTitle icon={(block.icon as IconName) ?? "sliders"}>{block.title}</SectionTitle>
      <Group ids={visible.map((c) => c.id)}>
        <div
          className={cn("grid grid-cols-12 gap-x-3", customizing ? "gap-y-6 pt-3" : "gap-y-3.5")}
        >
          {visible.map((child) => (
            <Item key={child.id} block={child} span={child.span ?? 12} compact>
              {renderBlock(child, ctx)}
            </Item>
          ))}
        </div>
      </Group>
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
    <div
      className="scroll-quiet h-full overflow-y-auto pr-1.5"
      style={{ width: doc?.sizes.params ?? 420 }}
    >
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
  );
}

export type { ParamBlock };
