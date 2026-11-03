/**
 * The image stage: a square box with the latest result, or the live preview while generating
 * (on the steps Settings → Generate → Preview picks); progress split by part of the run (the
 * workflow's sampling, then each stage) with speed and ETA; and, for a finished result, its size,
 * seed and how long it took. Clicking the image opens it full screen, a middle click opens it in
 * a new tab. A strip under the box shows the last run's images, only when it made more than one,
 * and the shown image's run info (RunInfo) comes after it. The column scrolls with the page.
 * Everything comes from the live bus: queue snapshots, step progress and binary preview frames.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { type LivePreview, useLive } from "@client/lib/live";
import { openWindow } from "@client/lib/platform";
import { useSettings } from "@client/lib/queries";
import {
  IconButton,
  ImageViewer,
  Spinner,
  StageProgress,
  type StageSegment,
  Tooltip,
} from "@client/ui";
import { comfyViewUrl } from "@shared/comfy";
import { averageRate, formatDuration } from "@shared/history";
import type { Job, JobImage } from "@shared/jobs";
import { PreviewSettings } from "@shared/settings";
import { AnimatePresence, motion } from "motion/react";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { previewDue, useLastRun } from "../preview";
import { RunInfo } from "./RunInfo";

interface Result {
  key: string;
  url: string;
  /** File name for the new tab's title. */
  name: string;
  job: Job;
}

const DEFAULT_PREVIEW = PreviewSettings.parse({});
const keyOf = (job: Job, img: JobImage) => `${job.id}/${img.subfolder}/${img.filename}`;

function seconds(job: Job): string | null {
  if (!job.startedAt || !job.finishedAt) return null;
  return `${((Date.parse(job.finishedAt) - Date.parse(job.startedAt)) / 1000).toFixed(1)}s`;
}

/** A job's pictures: a script's grid, or ComfyUI's saved images (its previews when it saved none). */
function resultsOf(job: Job): Result[] {
  if (job.file)
    return [
      {
        key: job.id,
        url: job.file.url,
        name: job.file.path.split(/[\\/]/).pop() ?? "grid.png",
        job,
      },
    ];
  return job.images
    .filter((img) => img.type === "output" || job.images.every((i) => i.type !== "output"))
    .map((image) => ({
      key: keyOf(job, image),
      url: comfyViewUrl(image),
      name: image.filename,
      job,
    }));
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

/** Middle click: the image in a new tab (or window, in the desktop app). */
function middleOpen(e: MouseEvent, r: Result) {
  if (e.button !== 1) return;
  e.preventDefault();
  void openWindow(r.url, r.name);
}

export function ImageStage() {
  const jobs = useLive((s) => s.queue.jobs);
  const running = jobs.find((j) => j.state === "running") ?? null;
  const progress = useLive((s) =>
    running && s.progress?.jobId === running.id ? s.progress.progress : null,
  );
  const preview = useLive((s) => (running && s.preview?.jobSeq === running.seq ? s.preview : null));
  const previewSettings = useSettings().data?.generate.preview ?? DEFAULT_PREVIEW;
  const runIds = useLastRun((s) => s.ids);
  const smoothed = useSpeed();
  // The server measures from when the node started; before its first steps, our own estimate.
  const speed = progress?.rate ?? smoothed;

  // The last run: the newest finished job and, when the last click queued it, the rest of that
  // click's jobs (oldest first, so the strip reads in run order).
  const results = useMemo<Result[]>(() => {
    // Batch files have their own panel.
    const done = jobs.filter((j) => j.state === "done" && j.group?.kind !== "batch");
    const newest = done[0];
    if (!newest) return [];
    const run = runIds.includes(newest.id) ? done.filter((j) => runIds.includes(j.id)) : [newest];
    return run.reverse().flatMap(resultsOf);
  }, [jobs, runIds]);
  const [selected, setSelected] = useState<string | null>(null);
  const newest = results.at(-1)?.key ?? null;
  const seenNewest = useRef<string | null>(null);
  useEffect(() => {
    // A new result arrived: show it.
    if (newest && newest !== seenNewest.current) {
      seenNewest.current = newest;
      setSelected(newest);
    }
  }, [newest]);
  const index = Math.max(
    0,
    results.findIndex((r) => r.key === selected),
  );
  const current = results.length ? (results[selected ? index : results.length - 1] ?? null) : null;
  const [viewing, setViewing] = useState(false);

  const lastError = jobs.find((j) => j.state === "error" || j.state === "done");
  const [dismissed, setDismissed] = useState<string | null>(null);
  const error = lastError?.state === "error" && lastError.id !== dismissed ? lastError : null;

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

  // Only the first part of a click's first run waits before its first preview.
  const firstRun = !running || !runIds.includes(running.id) || runIds[0] === running.id;
  const wait = (progress?.segment ?? 0) === 0 && (firstRun || !previewSettings.waitFirstOnly);
  const drawPreview =
    progress !== null && previewDue(progress.value, progress.max, previewSettings, wait);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-sunken">
        {running ? (
          <>
            <div className="absolute inset-0 grid place-items-center text-fg-3">
              <Spinner size={22} />
            </div>
            {previewSettings.show && preview ? (
              <PreviewCanvas key={running.id} preview={preview} draw={drawPreview} />
            ) : null}
          </>
        ) : current ? (
          <button
            type="button"
            onClick={() => setViewing(true)}
            onMouseDown={(e) => {
              // Keep the browser's autoscroll from starting on a middle click.
              if (e.button === 1) e.preventDefault();
            }}
            onAuxClick={(e) => middleOpen(e, current)}
            aria-label="Show full screen"
            className="absolute inset-0 cursor-zoom-in focus-ring"
          >
            {/* One element for every result: the last picture stays up while the next loads. */}
            <img
              src={current.url}
              alt={`Result, seed ${current.job.seed ?? "unknown"}`}
              className="h-full w-full object-contain"
              draggable
            />
          </button>
        ) : (
          <div className="absolute inset-0 grid place-items-center p-6">
            <EmptyStage />
          </div>
        )}

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

        {current && !running ? <ResultInfo job={current.job} /> : null}
      </div>

      {results.length > 1 && !running ? (
        <div className="scroll-quiet flex shrink-0 gap-1.5 overflow-x-auto pb-0.5">
          {results.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setSelected(r.key)}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
              onAuxClick={(e) => middleOpen(e, r)}
              aria-label={`Show result, seed ${r.job.seed ?? "unknown"}`}
              aria-pressed={r.key === current?.key}
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-surface transition-colors focus-ring",
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
            </button>
          ))}
        </div>
      ) : null}

      {current && !running ? <RunInfo jobId={current.job.id} /> : null}

      {viewing && current ? (
        <ImageViewer
          images={results.map((r) => ({
            key: r.key,
            src: r.url,
            alt: `Result, seed ${r.job.seed ?? "unknown"}`,
          }))}
          index={results.indexOf(current)}
          onIndex={(i) => setSelected(results[i]?.key ?? null)}
          onClose={() => setViewing(false)}
          onOpenTab={(img) => {
            const r = results.find((x) => x.key === img.key);
            if (r) void openWindow(r.url, r.name);
          }}
        />
      ) : null}
    </div>
  );
}

/** Size, seed and time of a finished result, small in the corner. */
function ResultInfo({ job }: { job: Job }) {
  const time = seconds(job);
  const rate = averageRate(job.timings);
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-black/55 px-2 py-1 font-mono text-2xs text-white/85 backdrop-blur-[2px]">
      {job.width && job.height ? (
        <span>
          {job.width}×{job.height}
        </span>
      ) : null}
      {job.seed !== null ? (
        <>
          <span className="text-white/40">·</span>
          <span>seed {job.seed}</span>
        </>
      ) : null}
      {time ? (
        <>
          <span className="text-white/40">·</span>
          {job.timings.length ? (
            <Tooltip content={<Timings job={job} />}>
              <span className="cursor-default underline decoration-white/40 decoration-dotted underline-offset-2">
                {time}
                {rate ? ` · ${rate.toFixed(2)} it/s` : ""}
              </span>
            </Tooltip>
          ) : (
            <span>{time}</span>
          )}
        </>
      ) : null}
    </div>
  );
}

/** How long each part of a finished run took (the info chip's tooltip). */
function Timings({ job }: { job: Job }) {
  return (
    <span className="flex min-w-[200px] flex-col gap-1 py-0.5">
      <span className="font-medium">Time per part</span>
      {job.timings.map((t) => (
        <span
          key={t.label}
          className="flex items-center justify-between gap-4 font-mono text-2xs tabular"
        >
          <span className="font-sans">{t.label}</span>
          <span>
            {formatDuration(t.ms)}
            {t.rate ? ` · ${t.rate.toFixed(2)} it/s` : t.steps ? ` · ${t.steps} steps` : ""}
          </span>
        </span>
      ))}
    </span>
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

/**
 * The live preview. Frames arrive every step but are drawn only when `draw` says so; the canvas
 * keeps the last one in between (the live client frees each frame once the next one arrives).
 */
function PreviewCanvas({ preview, draw }: { preview: LivePreview; draw: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new frame draws; `draw` is read with it
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!draw || !canvas || !ctx) return;
    if (canvas.width !== preview.bitmap.width || canvas.height !== preview.bitmap.height) {
      canvas.width = preview.bitmap.width;
      canvas.height = preview.bitmap.height;
    }
    ctx.drawImage(preview.bitmap, 0, 0);
  }, [preview]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full object-contain" />;
}
