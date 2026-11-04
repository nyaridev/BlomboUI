/**
 * The image stage: a square box with the latest result, or the live preview while generating
 * (on the steps Settings → Generate → Preview picks; the last result stays until the first frame).
 * Progress is the old app's bars across the top: the part that's running (its steps, or the
 * percent and ETA when it's the only part), and above it, when stages add parts (hires fix,
 * ADetailer), the whole run with a divider between parts. A finished result shows how long it
 * took and how fast it went (it/s; images per second when the run made several). Clicking the
 * image opens it full screen, a middle click opens it in a new tab (while a run goes too, until
 * its preview covers the last picture). A strip under the box shows the last run's images, only
 * when it made more than one (centered, arrows on both sides), and the shown image's run info
 * (RunInfo) comes after it, kept while the next run goes. The column scrolls with the page.
 * Everything comes from the live bus: queue snapshots, step progress and binary preview frames.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { type LivePreview, useLive } from "@client/lib/live";
import { openWindow } from "@client/lib/platform";
import { useSettings } from "@client/lib/queries";
import { IconButton, ImageViewer, RunBar, Spinner, Tooltip } from "@client/ui";
import { comfyViewUrl } from "@shared/comfy";
import { averageRate, formatDuration } from "@shared/history";
import type { Job, JobImage } from "@shared/jobs";
import { PreviewSettings } from "@shared/settings";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { previewDue, useLastRun, useShownImage } from "../preview";
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

/** Seconds from the first job's start to the last one's end (null if any is missing). */
function runSeconds(jobs: Job[]): number | null {
  const starts = jobs.map((j) => (j.startedAt ? Date.parse(j.startedAt) : Number.NaN));
  const ends = jobs.map((j) => (j.finishedAt ? Date.parse(j.finishedAt) : Number.NaN));
  if ([...starts, ...ends].some(Number.isNaN)) return null;
  const span = (Math.max(...ends) - Math.min(...starts)) / 1000;
  return span > 0 ? span : null;
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
  const shownUrl = current?.url ?? null;
  useEffect(() => useShownImage.setState({ url: shownUrl }), [shownUrl]);
  const [viewing, setViewing] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  // The arrows can pick a thumbnail that's scrolled away: bring it into view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the selection is the trigger
  useEffect(() => {
    strip.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);

  const lastError = jobs.find((j) => j.state === "error" || j.state === "done");
  const [dismissed, setDismissed] = useState<string | null>(null);
  const error = lastError?.state === "error" && lastError.id !== dismissed ? lastError : null;

  // Remaining steps of this part plus the parts still to come, at the current speed.
  const parts = running?.segments.map((seg) => seg.label) ?? [];
  const passes = Math.max(1, parts.length);
  const passesLeft = progress ? Math.max(0, passes - 1 - (progress.segment ?? 0)) : 0;
  const eta =
    progress && speed && speed > 0
      ? Math.round((progress.max - progress.value + passesLeft * progress.max) / speed)
      : null;
  const step = progress && progress.max > 0 ? progress.value / progress.max : 0;
  const percent = (n: number) => `${Math.round(n * 100)}%${eta !== null ? ` · ETA ${eta}s` : ""}`;
  const stepLabel = !progress
    ? "Starting…"
    : parts.length > 1
      ? `${parts[progress.segment] ?? "Sampling"} · ${progress.value} / ${progress.max}`
      : percent(step);

  // Only the first part of a click's first run waits before its first preview.
  const firstRun = !running || !runIds.includes(running.id) || runIds[0] === running.id;
  const wait = (progress?.segment ?? 0) === 0 && (firstRun || !previewSettings.waitFirstOnly);
  const drawPreview =
    progress !== null && previewDue(progress.value, progress.max, previewSettings, wait);
  // While a run goes, the last picture shows until its first preview frame covers it.
  const [drawnFor, setDrawnFor] = useState<string | null>(null);
  const lastShows = Boolean(running && current && drawnFor !== running.id);
  const stepTo = (dir: 1 | -1) => {
    if (!results.length) return;
    const next = results[(index + dir + results.length) % results.length];
    if (next) setSelected(next.key);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-sunken"
        onMouseDown={(e) => {
          if (running && e.button === 1) e.preventDefault();
        }}
        onAuxClick={(e) => {
          if (lastShows && current) middleOpen(e, current);
        }}
      >
        {running ? (
          <>
            {current ? (
              <img
                src={current.url}
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-fg-3">
                <Spinner size={22} />
              </div>
            )}
            {previewSettings.show && preview ? (
              <PreviewCanvas
                key={running.id}
                preview={preview}
                draw={drawPreview}
                onDrawn={() => setDrawnFor(running.id)}
              />
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
            className="absolute inset-0 cursor-default focus-ring"
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

        {running ? (
          <div className="absolute inset-x-0 top-0 flex flex-col">
            {parts.length > 1 ? (
              <RunBar
                value={progress?.overall ?? 0}
                label={percent(progress?.overall ?? 0)}
                parts={parts}
              />
            ) : null}
            <RunBar value={step} label={stepLabel} />
          </div>
        ) : null}

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

        {current && !running ? <ResultInfo job={current.job} run={results} /> : null}
      </div>

      {results.length > 1 && !running ? (
        <div className="flex h-16 items-stretch gap-1.5">
          <IconButton
            icon="chevron-left"
            label="Previous image"
            size="tall"
            variant="secondary"
            onClick={() => stepTo(-1)}
          />
          <div
            ref={strip}
            className="scroll-quiet flex min-w-0 flex-1 justify-center-safe gap-1.5 overflow-x-auto"
          >
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
          <IconButton
            icon="chevron-right"
            label="Next image"
            size="tall"
            variant="secondary"
            onClick={() => stepTo(1)}
          />
        </div>
      ) : null}

      {current ? <RunInfo jobId={current.job.id} /> : null}

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

/**
 * How long a finished result took, small in the corner: the run's time and images per second
 * when it made several, else the job's; the sampling speed (it/s, time per part on hover).
 */
function ResultInfo({ job, run }: { job: Job; run: Result[] }) {
  const rate = averageRate(job.timings);
  const many = run.length > 1 ? runSeconds(run.map((r) => r.job)) : null;
  const time = many !== null ? `${many.toFixed(1)}s` : seconds(job);
  const perSecond = many ? `${(run.length / many).toFixed(2)} img/s` : null;
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-black/55 px-2 py-1 font-mono text-2xs text-white/85 backdrop-blur-[2px]">
      {time ? <span>{time}</span> : null}
      {perSecond ? (
        <>
          <span className="text-white/40">·</span>
          <span>{perSecond}</span>
        </>
      ) : null}
      {rate ? (
        <>
          <span className="text-white/40">·</span>
          {job.timings.length ? (
            <Tooltip content={<Timings job={job} />}>
              <span className="cursor-default underline decoration-white/40 decoration-dotted underline-offset-2">
                {rate.toFixed(2)} it/s
              </span>
            </Tooltip>
          ) : (
            <span>{rate.toFixed(2)} it/s</span>
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
function PreviewCanvas({
  preview,
  draw,
  onDrawn,
}: {
  preview: LivePreview;
  draw: boolean;
  /** The first frame is on screen (it now covers the last picture). */
  onDrawn: () => void;
}) {
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
    if (!drawn) onDrawn();
    setDrawn(true);
  }, [preview]);
  // Clear until the first frame, so the last result shows through; then it covers it fully.
  const [drawn, setDrawn] = useState(false);
  return (
    <canvas
      ref={ref}
      className={cn("absolute inset-0 h-full w-full object-contain", drawn && "bg-sunken")}
    />
  );
}
