/**
 * Generate. Default arrangement: loaded models on top, prompts with the generate
 * stack beside them, workspace tabs, parameter column + image stage. Everything shows the
 * active workflow's bindings and values; the params column is a layout document that's
 * editable in Customize mode. A batch workflow shows the batch runner instead of the prompts
 * and the image stage. Dropping an image anywhere loads its settings (ImageDrop); the first
 * visit starts the tour (GenerateTour).
 */
import { glide } from "@client/lib/motion";
import { useSession } from "@client/lib/session";
import { Button, Spinner, Tabs } from "@client/ui";
import { useLocation } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useState } from "react";
import { BatchView } from "./batch/BatchView";
import { ImageStage } from "./blocks/ImageStage";
import { ModelsStrip } from "./blocks/ModelsStrip";
import { GenerateActions, Prompts } from "./blocks/Prompts";
import { CustomizeBar, Inspector, LayoutPicker } from "./Customize";
import { GenerateTour } from "./GenerateTour";
import { ImageDropOverlay, useImageDrop } from "./ImageDrop";
import { adoptBrowserLayouts } from "./layouts";
import { ModelGrid, type PickerTab } from "./ModelGrid";
import { ParamsColumn } from "./ParamsColumn";
import { StartWithWorkflow } from "./StartWithWorkflow";
import { useLayout, useValues } from "./state";
import { useActiveWorkflow } from "./workflow";

type WorkTab = "generation" | PickerTab;

const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: glide } };

export function GenerateView() {
  const [tab, setTab] = useState<WorkTab>("generation");
  const customizing = useLayout((s) => s.customizing);
  const setCustomizing = useLayout((s) => s.setCustomizing);
  const active = useActiveWorkflow();
  const load = useValues((s) => s.load);
  const loaded = useValues((s) => s.workflowId);
  const showLayout = useLayout((s) => s.show);
  const drop = useImageDrop();
  // Kept alive while hidden: the tour waits until Generate is the view on screen.
  const visible = useLocation({
    select: (l) => (l.pathname.split("/")[3] ?? "generate") === "generate",
  });

  // Show the workflow's saved values when it becomes active (before paint, so a switch never
  // shows one workflow's controls with the other's values).
  useLayoutEffect(() => {
    if (!active.manifest) return;
    load(active.manifest);
    showLayout(active.manifest);
  }, [active.manifest, load, showLayout]);

  // Layouts saved by older versions in this browser move into the profile once.
  const sessionProfile = useSession((s) => s.profileId);
  useEffect(() => {
    if (sessionProfile) void adoptBrowserLayouts();
  }, [sessionProfile]);

  if (active.empty) return <StartWithWorkflow />;
  // Only the first load shows a spinner; switching keeps the view mounted.
  if (!active.manifest || loaded === null) {
    return (
      <div className="grid h-full place-items-center text-fg-3">
        {active.error ? (
          <p className="max-w-sm text-center text-sm">{active.error.message}</p>
        ) : (
          <Spinner size={22} />
        )}
      </div>
    );
  }

  if (active.manifest.kind === "batch") return <BatchView manifest={active.manifest} />;

  return (
    <motion.div
      className="relative flex h-full flex-col gap-3 p-3"
      {...drop.handlers}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } },
      }}
    >
      <motion.div variants={item} data-tour="models">
        <ModelsStrip onPick={(t) => setTab(t)} />
      </motion.div>

      <motion.div variants={item} className="flex gap-3">
        <div data-tour="prompt" className="flex min-w-0 flex-1">
          <Prompts />
        </div>
        <div data-tour="generate" className="contents">
          <GenerateActions />
        </div>
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
              <div data-tour="params" className="contents">
                <ParamsColumn />
              </div>
              <AnimatePresence>{customizing ? <Inspector /> : null}</AnimatePresence>
              <div data-tour="stage" className="contents">
                <ImageStage />
              </div>
            </div>
          </div>
        ) : (
          <ModelGrid tab={tab} onDone={() => setTab("generation")} />
        )}
      </motion.div>
      <ImageDropOverlay over={drop.over} busy={drop.busy} />
      <GenerateTour ready={visible && tab === "generation" && !customizing} />
    </motion.div>
  );
}
