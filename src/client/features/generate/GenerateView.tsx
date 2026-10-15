/**
 * Generate. Default arrangement: loaded models on top, prompts with the generate
 * stack beside them, workspace tabs, parameter column + image stage. The params column is
 * data-driven (layout document) and editable in Customize mode.
 */
import {
  MOCK_CHECKPOINTS,
  MOCK_LORAS,
  MOCK_OTHER,
  type MockModel,
} from "@client/features/preview/mock";
import { glide } from "@client/lib/motion";
import { Button, ModelCard, Tabs, TextField } from "@client/ui";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { ImageStage } from "./blocks/ImageStage";
import { ModelsStrip } from "./blocks/ModelsStrip";
import { GenerateActions, Prompts } from "./blocks/Prompts";
import { CustomizeBar, Inspector, LayoutPicker } from "./Customize";
import { ParamsColumn } from "./ParamsColumn";
import { useLayout } from "./state";

type WorkTab = "generation" | "checkpoints" | "loras" | "wildcards" | "other";

const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: glide } };

export function GenerateView() {
  const [tab, setTab] = useState<WorkTab>("generation");
  const customizing = useLayout((s) => s.customizing);
  const setCustomizing = useLayout((s) => s.setCustomizing);

  return (
    <motion.div
      className="flex h-full flex-col gap-3 p-3"
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } },
      }}
    >
      <motion.div variants={item}>
        <ModelsStrip onPick={(t) => setTab(t)} />
      </motion.div>

      <motion.div variants={item} className="flex gap-3">
        <Prompts />
        <GenerateActions />
      </motion.div>

      <motion.div variants={item} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3">
          <Tabs
            variant="line"
            value={tab}
            onChange={setTab}
            label="Workspace"
            className="flex-1"
            items={[
              { value: "generation", label: "Generation", icon: "sliders" },
              { value: "checkpoints", label: "Checkpoints", icon: "models" },
              { value: "loras", label: "LoRAs", icon: "layers" },
              { value: "wildcards", label: "Wildcards", icon: "wildcards" },
              { value: "other", label: "Other", icon: "stack" },
            ]}
          />
          {tab === "generation" && !customizing ? (
            <div className="flex items-center gap-1.5 border-b border-line pb-1.5">
              <LayoutPicker />
              <Button size="sm" icon="customize" onClick={() => setCustomizing(true)}>
                Customize
              </Button>
            </div>
          ) : null}
        </div>

        {tab === "generation" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 pt-3">
            <AnimatePresence>{customizing ? <CustomizeBar /> : null}</AnimatePresence>
            <div className="flex min-h-0 flex-1 gap-3">
              <ParamsColumn />
              <AnimatePresence>{customizing ? <Inspector /> : null}</AnimatePresence>
              <ImageStage />
            </div>
          </div>
        ) : (
          <ModelGrid kind={tab} />
        )}
      </motion.div>
    </motion.div>
  );
}

function ModelGrid({ kind }: { kind: Exclude<WorkTab, "generation"> }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>("WAI Illustrious v14");
  const source: MockModel[] =
    kind === "checkpoints"
      ? MOCK_CHECKPOINTS
      : kind === "loras"
        ? MOCK_LORAS
        : kind === "wildcards"
          ? MOCK_OTHER.filter((m) => m.kind === "wildcards")
          : MOCK_OTHER.filter((m) => m.kind !== "wildcards");
  const list = source.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pt-3">
      <div className="flex items-center gap-2">
        <TextField
          icon="search"
          placeholder={`Search ${kind}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          className="w-80"
        />
        <span className="text-xs text-fg-3">{list.length} items</span>
      </div>
      <div className="scroll-quiet grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 overflow-auto pr-1">
        {list.map((m) => (
          <ModelCard
            key={m.name}
            name={m.name}
            kind={m.kind}
            baseModel={m.base}
            thumb={m.thumb}
            favorite={m.favorite}
            selected={picked === m.name}
            onClick={() => setPicked(m.name)}
            onFavorite={() => undefined}
          />
        ))}
      </div>
    </div>
  );
}
