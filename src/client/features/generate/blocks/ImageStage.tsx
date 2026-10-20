/**
 * The image stage: the selected result, or the live preview while generating; progress split by
 * part of the run (the workflow's sampling, then each stage) with speed and ETA; tools; and the strip of this session's results. Everything
 * comes from the live bus: queue snapshots, step progress and binary preview frames.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { type LivePreview, useLive } from "@client/lib/live";
import { openWindow } from "@client/lib/platform";
import { IconButton, Spinner, StageProgress, type StageSegment, toast } from "@client/ui";
import { comfyViewUrl } from "@shared/comfy";
import type { Job, JobImage } from "@shared/jobs";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useValues } from "../state";
import { useRoleBinding } from "../workflow";

interface Result {
  key: string;
  url: string;
  image: JobImage;
  job: Job;
}

const keyOf = (job: Job, img: JobImage) => `${job.id}/${img.subfolder}/${img.filename}`;

function seconds(job: Job): string | null {
  if (!job.startedAt || !job.finishedAt) return null;
  return `${((Date.parse(job.finishedAt) - Date.parse(job.startedAt)) / 1000).toFixed(1)}s`;
}

/** Steps per second from progress ticks, smoothed. */
function useSpeed(): number | null {
  const progress = useLive((s) => s.progress);
  const last = useRef<{ jobId: string; node: string | null; value: number; at: number } | null>(
    null,
  );
  const [speed, setSpeed] = useState<number | null>(null);
  useEffect(() => {
    if (!progress) {
      last.current = null;
      setSpeed(null);
      return;
    }
    const now = performance.now();
    const p = progress.progress;
    const prev = last.current;
    if (prev && prev.jobId === progress.jobId && prev.node === p.node && p.value > prev.value) {
      const instant = ((p.value - prev.value) / (now - prev.at)) * 1000;
      setSpeed((s) => (s === null ? instant : s * 0.7 + instant * 0.3));
    }
    last.current = { jobId: progress.jobId, node: p.node, value: p.value, at: now };
  }, [progress]);
  return speed;
}

export function ImageStage() {
  const jobs = useLive((s) => s.queue.jobs);
  const running = jobs.find((j) => j.state === "running") ?? null;
  const progress = useLive((s) =>
    running && s.progress?.jobId === running.id ? s.progress.progress : null,
  );
  const preview = useLive((s) => (running && s.preview?.jobSeq === running.seq ? s.preview : null));
  const widthId = useRoleBinding("latent.width")?.id;
  const heightId = useRoleBinding("latent.height")?.id;
  const seedId = useRoleBinding("sampler.seed")?.id;
  const valueW = useValues((s) => (widthId ? Number(s.values[widthId]) : Number.NaN));
  const valueH = useValues((s) => (heightId ? Number(s.values[heightId]) : Number.NaN));
  const speed = useSpeed();

  const results = useMemo<Result[]>(
    () =>
      jobs
        .filter((j) => j.state === "done")
        .flatMap((job) =>
          job.images
            .filter((img) => img.type === "output" || job.images.every((i) => i.type !== "output"))
            .map((image) => ({ key: keyOf(job, image), url: comfyViewUrl(image), image, job })),
        ),
    [jobs],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const newest = results[0]?.key ?? null;
  const seenNewest = useRef<string | null>(null);
  useEffect(() => {
    // A new result arrived: show it.
    if (newest && newest !== seenNewest.current) {
      seenNewest.current = newest;
      setSelected(newest);
    }
  }, [newest]);
  const current = results.find((r) => r.key === selected) ?? results[0] ?? null;

  const lastError = jobs.find((j) => j.state === "error" || j.state === "done");
  const [dismissed, setDismissed] = useState<string | null>(null);
  const error = lastError?.state === "error" && lastError.id !== dismissed ? lastError : null;

  const w = running?.width ?? current?.job.width ?? (Number.isFinite(valueW) ? valueW : 1024);
  const h = running?.height ?? current?.job.height ?? (Number.isFinite(valueH) ? valueH : 1024);

  // One segment per part of the run: the workflow's sampling, then each stage that samples.
  const parts = running?.segments;
  const segments: StageSegment[] = useMemo(() => {
    const list = parts?.length ? parts : [{ id: "base", label: "Sampling", nodes: [] }];
    const current = progress?.segment ?? 0;
    return list.map((seg, i) => {
      const local =
        i < current ? 1 : i > current || !progress ? 0 : Math.min(1, progress.value / progress.max);
      const steps = i === current && progress ? ` · ${progress.max} steps` : "";
      return {
        id: seg.id,
        label: `${seg.label}${steps}`,
        progress: local,
        state: i < current ? "done" : i === current ? "active" : "pending",
      } satisfies StageSegment;
    });
  }, [parts, progress]);

  // Remaining steps of this part plus the parts still to come, at the current speed.
  const passes = Math.max(1, parts?.length ?? 1);
  const passesLeft = progress ? Math.max(0, passes - 1 - (progress.segment ?? 0)) : 0;
  const eta =
    progress && speed && speed > 0
      ? Math.round((progress.max - progress.value + passesLeft * progress.max) / speed)
      : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-sunken [container-type:size]">
        <div className="absolute inset-0 grid place-items-center p-5">
          {running || current ? (
            <div
              className="relative overflow-hidden rounded-lg bg-surface shadow-pop"
              style={{
                aspectRatio: `${w} / ${h}`,
                width: `min(100cqw - 40px, (100cqh - 40px) * ${w / h})`,
              }}
            >
              {running ? (
                preview ? (
                  <PreviewCanvas preview={preview} />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-fg-3">
                    <Spinner size={22} />
                  </div>
                )
              ) : current ? (
                <img
                  key={current.key}
                  src={current.url}
                  alt={`Result, seed ${current.job.seed ?? "unknown"}`}
                  className="absolute inset-0 h-full w-full object-contain"
                  draggable
                />
              ) : null}
            </div>
          ) : (
            <EmptyStage />
          )}
        </div>

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
                  {progress ? `Step ${progress.value} of ${progress.max}` : "Preparing…"}
                </span>
                {speed ? (
                  <>
                    <span className="text-fg-3">·</span>
                    <span className="font-mono text-fg-2 tabular">{speed.toFixed(2)} it/s</span>
                  </>
                ) : null}
                <span className="ml-auto font-mono text-fg-3 tabular">
                  {eta !== null ? `ETA ${eta}s` : running.workflowName}
                </span>
              </div>
              <StageProgress segments={segments} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {error && !running ? (
          <div className="absolute inset-x-3 top-3 flex items-start gap-2.5 rounded-lg border border-red/35 bg-surface-3/95 p-3 text-xs shadow-pop">
            <Icon name="x-circle" size={15} className="mt-px shrink-0 text-red-ink" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium text-fg">The last run failed</span>
              <span className="break-words text-fg-2">{error.error}</span>
            </div>
            <IconButton
              icon="x"
              label="Dismiss"
              size="xs"
              className="ml-auto"
              onClick={() => setDismissed(error.id)}
            />
          </div>
        ) : null}

        {current && !running ? (
          <>
            <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-lg border border-line bg-surface-3/90 p-1 shadow-pop">
              <IconButton
                icon="maximize"
                label="Open full size"
                size="sm"
                onClick={() => void openWindow(current.url, current.image.filename)}
              />
              <IconButton
                icon="copy"
                label="Copy image"
                size="sm"
                onClick={() => void copyImage(current.url)}
              />
              {current.job.seed !== null && seedId ? (
                <IconButton
                  icon="seed"
                  label={`Use this seed (${current.job.seed})`}
                  size="sm"
                  onClick={() => reuseSeed(seedId, current.job.seed as number)}
                />
              ) : null}
            </div>
            <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-black/55 px-2 py-1 font-mono text-2xs text-white/85 backdrop-blur-[2px]">
              {current.job.width && current.job.height ? (
                <span>
                  {current.job.width}×{current.job.height}
                </span>
              ) : null}
              {current.job.seed !== null ? (
                <>
                  <span className="text-white/40">·</span>
                  <span>seed {current.job.seed}</span>
                </>
              ) : null}
              {seconds(current.job) ? (
                <>
                  <span className="text-white/40">·</span>
                  <span>{seconds(current.job)}</span>
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="scroll-quiet flex h-[76px] shrink-0 items-center gap-1.5 overflow-x-auto">
        <AnimatePresence initial={false}>
          {results.map((r) => (
            <motion.button
              key={r.key}
              layout
              initial={{ opacity: 0, scale: 0.8, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: 52 }}
              type="button"
              onClick={() => setSelected(r.key)}
              aria-label={`Show result, seed ${r.job.seed ?? "unknown"}`}
              className={cn(
                "relative h-[70px] shrink-0 overflow-hidden rounded-md border-2 bg-surface transition-colors focus-ring",
                r.key === current?.key
                  ? "border-accent"
                  : "border-transparent opacity-75 hover:opacity-100",
              )}
            >
              <img
                src={r.url}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </motion.button>
          ))}
        </AnimatePresence>
        <span className="ml-auto shrink-0 pl-3 text-2xs text-fg-3">
          {results.length
            ? `${results.length} this session`
            : "Results from this session appear here"}
        </span>
      </div>
    </div>
  );
}

function EmptyStage() {
  return (
    <div className="flex max-w-xs flex-col items-center gap-2 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-field text-fg-3">
        <Icon name="image" size={22} />
      </span>
      <span className="text-sm font-medium text-fg-2">Your images appear here</span>
      <span className="text-xs text-fg-3">
        Write a prompt and press Generate (Ctrl+Enter). You'll see it take shape step by step.
      </span>
    </div>
  );
}

/** Draws the latest preview bitmap; bitmaps are decoded off the main paint by the live client. */
function PreviewCanvas({ preview }: { preview: LivePreview }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (canvas.width !== preview.bitmap.width || canvas.height !== preview.bitmap.height) {
      canvas.width = preview.bitmap.width;
      canvas.height = preview.bitmap.height;
    }
    ctx.drawImage(preview.bitmap, 0, 0);
  }, [preview]);
  return (
    <canvas
      ref={ref}
      className="absolute inset-0 h-full w-full object-contain [image-rendering:auto]"
    />
  );
}

async function copyImage(url: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const png = blob.type === "image/png" ? blob : await toPng(blob);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    toast("Copied to clipboard", "success");
  } catch {
    toast("Couldn't copy the image. Open it full size and copy from there.", "error");
  }
}

async function toPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

function reuseSeed(seedId: string, seed: number) {
  const { setValue, setRun } = useValues.getState();
  setValue(seedId, seed);
  setRun({ seedMode: "fixed" });
  toast(`Seed ${seed} set; it stays fixed for the next runs`, "info");
}
