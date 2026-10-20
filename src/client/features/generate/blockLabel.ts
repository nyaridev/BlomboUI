/** How a layout block is named in Customize: its drag chip and the Inspector's header. */
import type { IconName } from "@client/icons/Icon";
import type { Block } from "@shared/layout/schema";
import { type Binding, resolveBind } from "@shared/workflow/manifest";
import type { StageId } from "@shared/workflow/roles";
import { STAGE_LABELS } from "@shared/workflow/stages";

/** Names come from STAGE_LABELS; only the icons are the client's. */
const STAGE_ICONS: Record<StageId, IconName> = {
  hires: "upscale",
  adetailer: "face-scan",
  controlnet: "pose",
  upscale: "upscale",
};

export function blockLabel(block: Block, bindings: Binding[]): { label: string; icon: IconName } {
  switch (block.type) {
    case "param": {
      const b = resolveBind(bindings, block.bind);
      return { label: block.title ?? b?.label ?? block.bind, icon: "sliders" };
    }
    case "card":
      return { label: block.title, icon: "layout-grid" };
    case "stage":
      return { label: STAGE_LABELS[block.stage], icon: STAGE_ICONS[block.stage] };
    case "params-rest":
      return { label: block.title ?? "More from this workflow", icon: "workflow" };
    case "feature":
      return {
        label:
          { resolution: "Size", seed: "Seed & batch", scripts: "Scripts" }[
            block.feature as "resolution" | "seed" | "scripts"
          ] ?? block.feature,
        icon:
          block.feature === "resolution"
            ? "aspect-ratio"
            : block.feature === "scripts"
              ? "layout-grid"
              : "seed",
      };
  }
}
