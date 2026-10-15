/**
 * The image stage: current result (or live preview while generating), progress split by stage,
 * tools, and the session strip. The preview sharpens as steps progress.
 */
import { useSystemPreview } from "@client/features/preview/systemPreview";
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { Art, IconButton, StageProgress, type StageSegment, toast } from "@client/ui";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useStages, useValues } from "../state";

export function ImageStage() {
  const running = useSystemPreview((s) => s.running);
  const progress = useSystemPreview((s) => s.progress);
  const hires = useStages((s) => s.hires.enabled);
  const ad = useStages((s) => s.adetailer.enabled);
  const steps = useValues((s) => Number(s.values["sampler.steps"]));
  const w = useValues((s) => Number(s.values["latent.width"]));
  const h = useValues((s) => Number(s.values["latent.height"]));
  const [results, setResults] = useState<string[]>(() => [
    "r-a",
    "r-b",
    "r-c",
    "r-d",
    "r-e",
    "r-f",
  ]);
  const [active, setActive] = useState("r-a");
  const [compare, setCompare] = useState(false);
  const wasRunning = useRef(running);
  const nextSeed = useRef(0);

  useEffect(() => {
    if (wasRunning.current && !running) {
      const id = `r-new-${nextSeed.current++}`;
      setResults((r) => [id, ...r].slice(0, 24));
      setActive(id);
    }
    wasRunning.current = running;
  }, [running]);

  const segments: StageSegment[] = (() => {
    const parts = [{ id: "base", label: `Base · ${steps} steps`, weight: 1 }];
    if (hires) parts.push({ id: "hires", label: "Hires fix", weight: 0.6 });
    if (ad) parts.push({ id: "ad", label: "ADetailer", weight: 0.35 });
    const total = parts.reduce((a, p) => a + p.weight, 0);
    let acc = 0;
    return parts.map((p) => {
      const from = acc / total;
      acc += p.weight;
      const to = acc / total;
      const local = Math.min(1, Math.max(0, (progress - from) / (to - from)));
      return {
        id: p.id,
        label: p.label,
        progress: local,
        state: progress >= to ? "done" : progress >= from ? "active" : "pending",
      } as StageSegment;
    });
  })();
  const current = segments.find((s) => s.state === "active");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-sunken [container-type:size]">
        {/* canvas */}
        <div className="absolute inset-0 grid place-items-center p-5">
          <div
            className="relative overflow-hidden rounded-lg shadow-pop"
            style={{
              aspectRatio: `${w} / ${h}`,
              width: `min(100cqw - 40px, (100cqh - 40px) * ${w / h})`,
            }}
          >
            <Art seed={running ? "live" : active} className="absolute inset-0" />
            {running ? (
              <div
                className="absolute inset-0 backdrop-grayscale-[.4] transition-[backdrop-filter] duration-700"
                style={{ backdropFilter: `blur(${Math.round((1 - progress) * 18)}px)` }}
              />
            ) : null}
            {compare && !running ? (
              <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white shadow-[0_0_12px_rgb(0_0_0/.6)]">
                <span className="absolute top-1/2 left-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-black">
                  <Icon name="compare" size={14} />
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* progress */}
        <AnimatePresence>
          {running ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute inset-x-3 top-3 flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-3/95 p-3 shadow-pop"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-generate-ink">
                  {current?.label ?? "Finishing"}
                </span>
                <span className="text-fg-3">·</span>
                <span className="font-mono text-fg-2 tabular">
                  {(3.8 + progress).toFixed(1)} it/s
                </span>
                <span className="ml-auto font-mono text-fg-3 tabular">
                  ETA {Math.max(0, Math.round((1 - progress) * 14))}s
                </span>
              </div>
              <StageProgress segments={segments} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* tools */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-lg border border-line bg-surface-3/90 p-1 shadow-pop">
          <IconButton
            icon="compare"
            label="Compare with previous"
            size="sm"
            active={compare}
            onClick={() => setCompare(!compare)}
            tooltip
          />
          <IconButton icon="zoom-in" label="Zoom (Z)" size="sm" />
          <IconButton icon="info" label="Image info" size="sm" />
          <IconButton
            icon="copy"
            label="Copy image"
            size="sm"
            onClick={() => toast("Copied to clipboard", "success")}
          />
          <IconButton icon="pose" label="Use as ControlNet input" size="sm" />
          <IconButton icon="folder-open" label="Show in folder" size="sm" />
        </div>
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-black/55 px-2 py-1 font-mono text-2xs text-white/85 backdrop-blur-[2px]">
          <span>
            {w}×{h}
          </span>
          <span className="text-white/40">·</span>
          <span>seed 284119032</span>
          <span className="text-white/40">·</span>
          <span>9.2s</span>
        </div>
      </div>

      {/* session strip */}
      <div className="scroll-quiet flex h-[76px] shrink-0 items-center gap-1.5 overflow-x-auto">
        <AnimatePresence initial={false}>
          {results.map((id) => (
            <motion.button
              key={id}
              layout
              initial={{ opacity: 0, scale: 0.8, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: 52 }}
              type="button"
              onClick={() => setActive(id)}
              aria-label="Show result"
              className={cn(
                "relative h-[70px] shrink-0 overflow-hidden rounded-md border-2 transition-colors focus-ring",
                id === active ? "border-accent" : "border-transparent opacity-75 hover:opacity-100",
              )}
            >
              <Art seed={id} className="absolute inset-0" />
            </motion.button>
          ))}
        </AnimatePresence>
        <span className="ml-auto shrink-0 pl-3 text-2xs text-fg-3">
          {results.length} this session
        </span>
      </div>
    </div>
  );
}
