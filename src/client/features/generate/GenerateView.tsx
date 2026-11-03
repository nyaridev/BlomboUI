/**
 * Generate. Default arrangement: loaded models on top, prompts with the generate
 * stack beside them, workspace tabs, parameter column + image stage. Everything shows the
 * active workflow's bindings and values; the params column is a layout document that's
 * editable in Customize mode. A batch workflow shows the batch runner instead of the prompts
 * and the image stage. Dropping an image anywhere loads its settings (ImageDrop); the first
 * visit starts the tour (GenerateTour). On narrow screens the view scrolls as one column: prompt,
 * Generate, then the image above the parameters; Customize stays a desktop tool.
 */
import { glide } from "@client/lib/motion";
import { useSettings, useUpdateSettings } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Button, Spinner, Splitter, Tabs } from "@client/ui";
import { GenerateSettings } from "@shared/settings";
import { useLocation } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BatchView } from "./batch/BatchView";
import { ImageStage } from "./blocks/ImageStage";
import { ModelsStrip, type StripTarget } from "./blocks/ModelsStrip";
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

const DEFAULT_SHARE = GenerateSettings.parse({}).paramsShare;

const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: glide } };

export function GenerateView() {
  const [tab, setTab] = useState<WorkTab>("generation");
  // The strip tile the picker is changing; any other way of changing tabs forgets it.
  const [target, setTarget] = useState<StripTarget | null>(null);
  // The params' share of the row: follows the splitter while dragging, saved when it's let go.
  const savedShare = useSettings().data?.generate.paramsShare;
  const updateSettings = useUpdateSettings();
  const [share, setShare] = useState<number | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const paramsShare = share ?? savedShare ?? DEFAULT_SHARE;
  const changeTab = (next: WorkTab) => {
    setTab(next);
    setTarget(null);
  };
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

  useEffect(() => {
    if (!visible) setTarget(null);
  }, [visible]);

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
      // One scrollbar for the whole view: the strip, prompts, tabs and the params all scroll.
      className="scroll-quiet relative flex h-full flex-col gap-3 overflow-y-auto p-3 max-lg:p-2"
      {...drop.handlers}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } },
      }}
    >
      <motion.div variants={item} data-tour="models">
        <ModelsStrip
          target={target}
          onTarget={(next, nextTab) => {
            setTarget(next);
            if (nextTab) setTab(nextTab);
          }}
        />
      </motion.div>

      <motion.div variants={item} className="flex gap-3 max-lg:flex-col">
        <div data-tour="prompt" className="flex min-w-0 flex-1">
          <Prompts />
        </div>
        <div data-tour="generate" className="contents">
          <GenerateActions />
        </div>
      </motion.div>

      <motion.div variants={item} className="flex flex-none flex-col">
        <div className="flex items-center gap-3">
          <Tabs
            variant="line"
            value={tab}
            onChange={changeTab}
            label="Workspace"
            className="min-w-0 flex-1"
            items={[
              { value: "generation", label: "Generation", icon: "sliders" },
              { value: "checkpoints", label: "Checkpoints", icon: "models" },
              { value: "loras", label: "LoRAs", icon: "layers" },
              { value: "wildcards", label: "Wildcards", icon: "wildcards" },
              { value: "other", label: "Other", icon: "stack" },
            ]}
          />
          {tab === "generation" && !customizing ? (
            <div className="flex items-center gap-1.5 border-b border-line pb-1.5 max-lg:hidden">
              <LayoutPicker />
              <Button size="sm" icon="customize" onClick={() => setCustomizing(true)}>
                Customize
              </Button>
            </div>
          ) : null}
        </div>

        {tab === "generation" ? (
          <div className="flex flex-col gap-3 pt-3">
            <AnimatePresence>{customizing ? <CustomizeBar /> : null}</AnimatePresence>
            <div ref={row} className="flex items-stretch pb-3 max-lg:flex-col-reverse max-lg:gap-3">
              <div
                data-tour="params"
                className="min-w-0 shrink-0 max-lg:w-full!"
                style={{ width: `${paramsShare * 100}%` }}
              >
                <ParamsColumn />
              </div>
              <Splitter
                container={row}
                share={paramsShare}
                onChange={setShare}
                onCommit={(next) => updateSettings.mutate({ generate: { paramsShare: next } })}
                onReset={() => {
                  setShare(null);
                  updateSettings.mutate({ generate: { paramsShare: DEFAULT_SHARE } });
                }}
                label="Resize the settings and the image"
                className="max-lg:hidden"
              />
              <AnimatePresence>{customizing ? <Inspector /> : null}</AnimatePresence>
              <div data-tour="stage" className="min-w-0 flex-1">
                <ImageStage />
              </div>
            </div>
          </div>
        ) : (
          <ModelGrid
            tab={tab}
            target={target}
            onTarget={setTarget}
            onDone={() => changeTab("generation")}
          />
        )}
      </motion.div>
      <ImageDropOverlay over={drop.over} busy={drop.busy} />
      <GenerateTour ready={visible && tab === "generation" && !customizing} />
    </motion.div>
  );
}
