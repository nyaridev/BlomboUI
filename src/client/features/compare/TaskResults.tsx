/**
 * A comparison's results as a grid: one setting across, another down, and a small picker for
 * each other setting (the value shown, ‹ › to step through them). Tiles grow and shrink with the
 * size slider or Ctrl + wheel; a click opens the image full screen (← → through the grid);
 * Ctrl, ⌘ or Shift + click, or a tile's corner box, picks it to compare (two picks: flip between
 * them in place, a slider between them, or side by side). Combinations not made yet, waiting,
 * running, failed or stopped say so in their tile.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { clamp } from "@client/lib/number";
import {
  Button,
  type CompareMode,
  Dialog,
  EmptyState,
  IconButton,
  ImageCompare,
  ImageViewer,
  ProgressBar,
  Segmented,
  Select,
  Slider,
  Spinner,
  Tooltip,
} from "@client/ui";
import type { CompareCell, CompareResult, CompareTask } from "@shared/compare";
import { bindingFor } from "@shared/workflow/manifest";
import { useEffect, useMemo, useRef, useState } from "react";
import { startComparison, stopComparison } from "./actions";
import { type GridLayout, NEW_LAYOUT, TILE_SIZES, useCompareUi, useTaskPlan } from "./state";

const NONE = "-1";

interface Tile {
  cell: CompareCell;
  result: CompareResult | undefined;
}

export function TaskResults({ task }: { task: CompareTask }) {
  const { plan, error, loading, bindings } = useTaskPlan(task);
  const saved = useCompareUi((s) => s.layouts[task.id]) ?? NEW_LAYOUT;
  const setLayout = (patch: Partial<GridLayout>) =>
    useCompareUi.getState().setLayout(task.id, patch);
  const [viewing, setViewing] = useState<number | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Ctrl + wheel zooms the tiles (a native listener: it has to stop the page zoom).
  const size = saved.size;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = sizeRef.current * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
      useCompareUi
        .getState()
        .setLayout(task.id, { size: Math.round(clamp(next, TILE_SIZES.min, TILE_SIZES.max)) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [task.id]);

  const results = useMemo(() => new Map(task.results.map((r) => [r.key, r])), [task.results]);
  const cells = useMemo(
    () => new Map((plan?.cells ?? []).map((c) => [c.coords.join(","), c])),
    [plan],
  );

  if (!plan)
    return (
      <EmptyState
        className="m-auto"
        icon={loading ? "layout-grid" : "info"}
        tone={loading ? "neutral" : "warning"}
        title={loading ? "Loading…" : "This comparison can't be shown"}
        text={error ?? undefined}
      />
    );

  const n = plan.axes.length;
  const x = saved.x === -1 ? -1 : saved.x < n ? saved.x : n ? 0 : -1;
  const yWanted = saved.y >= 0 && saved.y < n && saved.y !== x ? saved.y : -1;
  // -1 is "Nothing" on purpose; any other value that doesn't fit falls back to the next row.
  const y = saved.y === -1 ? -1 : yWanted >= 0 ? yWanted : n > 1 ? (x === 0 ? 1 : 0) : -1;
  const pin = (i: number) => clamp(saved.pins[i] ?? 0, 0, (plan.axes[i]?.values.length ?? 1) - 1);
  const cols = x >= 0 ? (plan.axes[x]?.values ?? []) : [null];
  const rows = y >= 0 ? (plan.axes[y]?.values ?? []) : [null];
  const tileAt = (cx: number, cy: number): Tile | null => {
    const coords = plan.axes.map((_, i) => (i === x ? cx : i === y ? cy : pin(i)));
    const cell = cells.get(coords.join(","));
    return cell ? { cell, result: results.get(cell.key) } : null;
  };
  const grid = rows.map((_, cy) => cols.map((_, cx) => tileAt(cx, cy)));
  const shown = grid.flat().filter((t): t is Tile => Boolean(t?.result?.image));

  // The shape tiles wait in: the first image's, else the workflow's size.
  const w = bindingFor(bindings, "latent.width");
  const h = bindingFor(bindings, "latent.height");
  const first = task.results.find((r) => r.image)?.image;
  const aspect = first
    ? first.width / first.height
    : w && h
      ? Number(task.values[w.id]) / Number(task.values[h.id]) || 1
      : 1;

  const all = plan.cells.length;
  const made = plan.cells.filter((c) => results.get(c.key)?.state === "done").length;
  const failed = plan.cells.filter((c) => results.get(c.key)?.state === "error").length;
  const missing = all - made;

  const pick = (key: string) =>
    setPicks((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key].slice(-2)));
  const picked = picks
    .map((k) => plan.cells.find((c) => c.key === k))
    .filter((c): c is CompareCell => Boolean(c && results.get(c.key)?.image));
  const axisOptions = [
    { value: NONE, label: "Nothing" },
    ...plan.axes.map((a, i) => ({ value: String(i), label: a.name })),
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* What's across, down, and the value of every other setting. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5 max-lg:px-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-fg-3">Across</span>
          <Select
            size="sm"
            label="Across"
            value={String(x)}
            options={axisOptions}
            onChange={(v) => {
              const nx = Number(v);
              setLayout({ x: nx, y: nx === y ? x : y });
            }}
          />
          <IconButton
            icon="swap-horizontal"
            label="Swap across and down"
            size="sm"
            onClick={() => setLayout({ x: y, y: x })}
          />
          <span className="text-xs text-fg-3">Down</span>
          <Select
            size="sm"
            label="Down"
            value={String(y)}
            options={axisOptions}
            onChange={(v) => {
              const ny = Number(v);
              setLayout({ y: ny, x: ny === x ? y : x });
            }}
          />
        </div>
        {plan.axes.map((axis, i) =>
          i === x || i === y ? null : (
            <div key={axis.name + String(i)} className="flex items-center gap-0.5">
              <span className="mr-1 text-xs text-fg-3">{axis.name}</span>
              <IconButton
                icon="chevron-left"
                label={`Previous ${axis.name}`}
                size="sm"
                disabled={pin(i) === 0}
                onClick={() => setLayout({ pins: { ...saved.pins, [i]: pin(i) - 1 } })}
              />
              <Select
                size="sm"
                label={axis.name}
                value={String(pin(i))}
                options={axis.values.map((v, j) => ({ value: String(j), label: v.value }))}
                onChange={(v) => setLayout({ pins: { ...saved.pins, [i]: Number(v) } })}
              />
              <IconButton
                icon="chevron-right"
                label={`Next ${axis.name}`}
                size="sm"
                disabled={pin(i) >= axis.values.length - 1}
                onClick={() => setLayout({ pins: { ...saved.pins, [i]: pin(i) + 1 } })}
              />
            </div>
          ),
        )}
        <div className="ml-auto flex w-44 items-center gap-2 max-lg:ml-0">
          <Icon name="zoom-in" size={14} className="shrink-0 text-fg-3" />
          <Slider
            size="sm"
            ariaLabel="Tile size"
            min={TILE_SIZES.min}
            max={TILE_SIZES.max}
            value={size}
            defaultValue={TILE_SIZES.default}
            unit="px"
            onChange={(s) => setLayout({ size: s })}
            className="flex-1"
          />
        </div>
      </div>

      {/* Progress: how many are made, and what's left. */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs max-lg:px-3">
        <span className="text-fg-2 tabular">
          {made} of {all} made
          {failed ? <span className="text-danger"> · {failed} failed</span> : null}
        </span>
        <ProgressBar
          value={all ? made / all : 0}
          label="Images made"
          size="sm"
          tone={failed ? "danger" : "accent"}
          className="max-w-64 flex-1"
        />
        {task.running ? (
          <Button
            size="sm"
            variant="ghost"
            icon="stop"
            onClick={() => void stopComparison(task.id)}
          >
            Stop
          </Button>
        ) : missing ? (
          <Button
            size="sm"
            variant="ghost"
            icon="play"
            onClick={() => void startComparison(task.id, "missing")}
          >
            Make the {missing} missing
          </Button>
        ) : null}
        <span className="ml-auto text-fg-4 max-lg:hidden">
          Click a tile to see it big · Ctrl + click two to compare · Ctrl + wheel to zoom
        </span>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
        <div
          className="grid w-max gap-1.5 px-4 pb-24 max-lg:px-3"
          style={{
            gridTemplateColumns: `${y >= 0 ? "max-content " : ""}repeat(${cols.length}, ${size}px)`,
          }}
        >
          {x >= 0 ? (
            <>
              {y >= 0 ? <div className="sticky top-0 left-0 z-20 bg-bg" /> : null}
              {cols.map((c, i) => (
                <div
                  key={`c${String(i)}`}
                  className="sticky top-0 z-10 truncate bg-bg py-1.5 text-center text-xs font-medium text-fg-2"
                  title={c?.label}
                >
                  {c?.value}
                </div>
              ))}
            </>
          ) : null}
          {grid.map((line, cy) => (
            <Row
              key={cy}
              label={y >= 0 ? rows[cy] : null}
              line={line}
              size={size}
              aspect={aspect}
              picks={picks}
              onOpen={(t) => setViewing(shown.indexOf(t))}
              onPick={pick}
              shown={shown}
            />
          ))}
        </div>
      </div>

      {picks.length ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-line bg-surface-3 px-3 py-2 text-sm shadow-pop">
            <span className="text-fg-2">
              {picked.length === 2 ? "Two picked" : "One picked: Ctrl + click another to compare"}
            </span>
            <Button
              size="sm"
              variant="primary"
              icon="compare"
              disabled={picked.length < 2}
              onClick={() => setComparing(true)}
            >
              Compare
            </Button>
            <IconButton icon="x" label="Clear the picks" size="sm" onClick={() => setPicks([])} />
          </div>
        </div>
      ) : null}

      {viewing !== null && shown.length ? (
        <ImageViewer
          images={shown.map((t) => ({
            key: t.cell.key,
            src: t.result?.image?.url ?? "",
            preview: t.result?.image?.thumb,
            width: t.result?.image?.width,
            height: t.result?.image?.height,
            alt: t.cell.label,
          }))}
          index={clamp(viewing, 0, shown.length - 1)}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          actions={(i) => {
            const t = shown[i];
            return t ? (
              <span className="max-w-[50vw] truncate rounded-md bg-black/60 px-2 py-1 text-xs text-white/85">
                {t.cell.label}
              </span>
            ) : null;
          }}
        />
      ) : null}

      {comparing && picked.length === 2 ? (
        <CompareDialog
          a={{
            cell: picked[0] as CompareCell,
            src: results.get(picked[0]?.key ?? "")?.image?.url ?? "",
          }}
          b={{
            cell: picked[1] as CompareCell,
            src: results.get(picked[1]?.key ?? "")?.image?.url ?? "",
          }}
          onClose={() => setComparing(false)}
        />
      ) : null}
    </div>
  );
}

function Row({
  label,
  line,
  size,
  aspect,
  picks,
  shown,
  onOpen,
  onPick,
}: {
  label: { value: string; label: string } | null | undefined;
  line: Array<Tile | null>;
  size: number;
  aspect: number;
  picks: string[];
  shown: Tile[];
  onOpen: (tile: Tile) => void;
  onPick: (key: string) => void;
}) {
  return (
    <>
      {label !== null ? (
        <div
          className="sticky left-0 z-10 flex max-w-48 items-center justify-end bg-bg pr-2 text-right text-xs font-medium text-fg-2"
          title={label?.label}
        >
          <span className="line-clamp-3 break-words">{label?.value}</span>
        </div>
      ) : null}
      {line.map((t, i) => (
        <TileView
          key={i}
          tile={t}
          size={size}
          aspect={aspect}
          pick={t ? picks.indexOf(t.cell.key) : -1}
          onOpen={() => {
            const found = t && shown.find((s) => s.cell.key === t.cell.key);
            if (found) onOpen(found);
          }}
          onPick={() => t && onPick(t.cell.key)}
        />
      ))}
    </>
  );
}

const STATE_TEXT = {
  queued: { icon: "clock", text: "Waiting" },
  running: { icon: null, text: "Making…" },
  error: { icon: "x-circle", text: "Failed" },
  cancelled: { icon: "stop", text: "Stopped" },
  missing: { icon: "image", text: "Not made yet" },
} as const;

function TileView({
  tile,
  size,
  aspect,
  pick,
  onOpen,
  onPick,
}: {
  tile: Tile | null;
  size: number;
  aspect: number;
  /** 0 or 1 when picked to compare (A or B), else -1. */
  pick: number;
  onOpen: () => void;
  onPick: () => void;
}) {
  const r = tile?.result;
  const image = r?.image;
  const busy = r?.state === "queued" || r?.state === "running";
  const state = !r ? "missing" : r.state === "done" ? null : r.state;
  const info = state ? STATE_TEXT[state] : null;
  const label = tile?.cell.label ?? "";
  const body = (
    <div
      className={cn(
        "group relative overflow-hidden rounded-md bg-sunken",
        pick >= 0 && "ring-2 ring-accent-ink",
      )}
      style={{ width: size, aspectRatio: String(aspect) }}
    >
      {image ? (
        <button
          type="button"
          aria-label={`${label}. Open it big.`}
          onClick={(e) => (e.ctrlKey || e.metaKey || e.shiftKey ? onPick() : onOpen())}
          className="block size-full focus-ring"
        >
          <img
            src={size > 360 ? image.url : image.thumb}
            alt={label}
            loading="lazy"
            draggable={false}
            className={cn("size-full object-cover", busy && "opacity-40")}
          />
        </button>
      ) : null}
      {info && (!image || busy) ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center text-xs text-fg-3">
          {state === "running" ? (
            <Spinner size={16} />
          ) : info.icon ? (
            <Icon
              name={info.icon}
              size={16}
              className={state === "error" ? "text-danger" : undefined}
            />
          ) : null}
          {size >= 110 ? (
            <span className={state === "error" ? "text-danger" : undefined}>{info.text}</span>
          ) : null}
        </div>
      ) : null}
      {image ? (
        <button
          type="button"
          aria-label={pick >= 0 ? `Unpick ${label}` : `Pick ${label} to compare`}
          aria-pressed={pick >= 0}
          onClick={onPick}
          className={cn(
            "absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-md text-xs font-semibold focus-ring",
            pick >= 0
              ? "bg-accent text-on-accent"
              : "bg-black/55 text-white/80 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 focus-visible:opacity-100",
          )}
        >
          {pick >= 0 ? pick === 0 ? "A" : "B" : <Icon name="compare" size={13} />}
        </button>
      ) : null}
    </div>
  );
  return r?.state === "error" && r.error ? <Tooltip content={r.error}>{body}</Tooltip> : body;
}

const MODES: Array<{ value: CompareMode; label: string }> = [
  { value: "flip", label: "Flip" },
  { value: "slider", label: "Slider" },
  { value: "side", label: "Side by side" },
];

function CompareDialog({
  a,
  b,
  onClose,
}: {
  a: { cell: CompareCell; src: string };
  b: { cell: CompareCell; src: string };
  onClose: () => void;
}) {
  const [mode, setMode] = useState<CompareMode>("flip");
  // Only what differs between them names each side ("euler" vs "heun"), not the whole label.
  const pa = a.cell.label.split(" · ");
  const pb = b.cell.label.split(" · ");
  const diff = (mine: string[], other: string[]) =>
    mine.filter((p, i) => p !== other[i]).join(" · ") || mine.join(" · ");
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Compare two images"
      width={1200}
    >
      <div className="flex flex-col gap-3">
        <Segmented
          size="sm"
          label="How to compare"
          options={MODES}
          value={mode}
          onChange={setMode}
        />
        <ImageCompare
          mode={mode}
          a={{ src: a.src, label: `A · ${diff(pa, pb)}` }}
          b={{ src: b.src, label: `B · ${diff(pb, pa)}` }}
          className="h-[62svh]"
        />
        <p className="text-xs text-fg-4">
          {mode === "flip"
            ? "Click the image (or press Space) to switch between them and see what changes."
            : mode === "slider"
              ? "Drag the line, or move it with ← →."
              : "A on the left, B on the right."}
        </p>
      </div>
    </Dialog>
  );
}
