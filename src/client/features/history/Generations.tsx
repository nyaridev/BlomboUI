/**
 * History → Generations: every run Blombo logged (services/history.ts), newest first, with its
 * first image, prompt, model, seed, time and speed per stage. Run again repeats it exactly (same
 * values, stages and seed) or with a new seed; Use these settings loads it into Generate.
 * A virtualized list that pages in as you scroll.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useDebounced, useGoToView } from "@client/lib/hooks";
import { qk, useJobHistory } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  IconButton,
  Menu,
  Segmented,
  Skeleton,
  TextField,
  Tooltip,
  toast,
} from "@client/ui";
import { averageRate, formatDuration, type JobRecord } from "@shared/history";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyImageSettings } from "../generate/applySettings";
import { SyntaxText } from "../help/SyntaxText";

const STATE: Record<
  JobRecord["state"],
  { label: string; tone: "success" | "danger" | "warning" | "neutral" }
> = {
  done: { label: "Done", tone: "success" },
  error: { label: "Failed", tone: "danger" },
  interrupted: { label: "Stopped", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "neutral" },
};

function when(ms: number): string {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

const shortModel = (m: string) =>
  m
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.(safetensors|ckpt|pt|gguf|sft)$/i, "") ?? m;

export function Generations() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"all" | "done" | "failed">("all");
  const q = useDebounced(query.trim(), 250);
  const history = useJobHistory({ q, state });
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const go = useGoToView();
  const [confirm, setConfirm] = useState(false);
  const items = useMemo(() => history.data?.pages.flatMap((p) => p.items) ?? [], [history.data]);
  const total = history.data?.pages[0]?.total ?? 0;
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 92,
    overscan: 6,
  });
  const rows = virtual.getVirtualItems();
  const last = rows[rows.length - 1]?.index ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  useEffect(() => {
    if (last >= items.length - 10 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [last, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const rerun = async (r: JobRecord, newSeed: boolean) => {
    try {
      await api.rerunJob(r.id, newSeed);
      toast(
        newSeed ? `Queued ${r.workflowName} with a new seed` : `Queued ${r.workflowName} again`,
        "success",
        {
          label: "Show",
          run: () => go("generate"),
        },
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };
  const loadSettingsOf = async (r: JobRecord) => {
    try {
      const detail = await api.jobRecord(r.id);
      const ok = await applyImageSettings(
        { workflowId: detail.workflowId, values: detail.values, roles: {} },
        detail.seed,
      );
      if (ok) {
        toast(`Loaded the settings of this ${r.workflowName} run`, "success");
        go("generate");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <div ref={scroller} className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto max-w-[1120px] px-8 py-5">
        <div className="mb-3 flex items-center gap-2">
          <TextField
            icon="search"
            size="sm"
            placeholder="Search prompts, workflows and models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            className="w-80"
          />
          <Segmented
            size="sm"
            value={state}
            onChange={setState}
            options={[
              { value: "all", label: "All" },
              { value: "done", label: "Done" },
              { value: "failed", label: "Failed or stopped" },
            ]}
          />
          <span className="ml-auto text-xs text-fg-3 tabular">
            {total.toLocaleString()} run{total === 1 ? "" : "s"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            disabled={!total}
            onClick={() => setConfirm(true)}
          >
            Clear
          </Button>
        </div>
        {history.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : history.error ? (
          <EmptyState
            icon="errors"
            tone="warning"
            title="Couldn't read the generation history"
            text={history.error.message}
            action={<Button onClick={() => void history.refetch()}>Try again</Button>}
          />
        ) : !items.length ? (
          <EmptyState
            icon="history"
            title={q || state !== "all" ? "No run matches" : "Nothing generated yet"}
            text="Every run is logged here with its prompt, model, seed and timing, so you can run it again or load its settings."
            action={
              q || state !== "all" ? undefined : (
                <Button icon="generate" onClick={() => go("generate")}>
                  Go to Generate
                </Button>
              )
            }
          />
        ) : (
          <div
            className="relative overflow-hidden rounded-lg border border-line bg-surface"
            style={{ height: virtual.getTotalSize() }}
          >
            {rows.map((v) => {
              const r = items[v.index];
              if (!r) return null;
              return (
                <div
                  key={r.id}
                  ref={virtual.measureElement}
                  data-index={v.index}
                  className="absolute inset-x-0 top-0 border-b border-line last:border-b-0"
                  style={{ transform: `translateY(${v.start}px)` }}
                >
                  <RunRow
                    r={r}
                    onRerun={(newSeed) => void rerun(r, newSeed)}
                    onUse={() => void loadSettingsOf(r)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Clear the generation history?"
        description="The log of runs goes away, and with it the prompt history and the counts in Settings → Overview. Your images stay in the gallery."
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                setConfirm(false);
                void api
                  .removeJobRecords({ all: true })
                  .then(({ removed }) => {
                    void qc.invalidateQueries({ queryKey: qk.history(profileId) });
                    toast(`Cleared ${removed.toLocaleString()} runs`, "success");
                  })
                  .catch((e: Error) => toast(e.message, "error"));
              }}
            >
              Clear history
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}

function RunRow({
  r,
  onRerun,
  onUse,
}: {
  r: JobRecord;
  onRerun: (newSeed: boolean) => void;
  onUse: () => void;
}) {
  const state = STATE[r.state];
  const rate = averageRate(r.timings);
  return (
    <div className="group flex items-center gap-4 px-4 py-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-line bg-sunken">
        {r.thumb ? (
          <img src={r.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-fg-4">
            <Icon name={r.state === "error" ? "x-circle" : "image"} size={18} />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">{r.workflowName}</span>
          <Badge tone={state.tone}>{state.label}</Badge>
          {r.groupTitle ? <Badge>{r.groupTitle}</Badge> : null}
          <span className="ml-auto shrink-0 font-mono text-2xs text-fg-4 tabular">
            {when(r.finishedAt)}
          </span>
        </div>
        {r.error ? (
          <span className="truncate text-xs text-red-ink">{r.error}</span>
        ) : r.prompt ? (
          <SyntaxText text={r.prompt} className="line-clamp-1 text-xs text-fg-2" />
        ) : (
          <span className="text-xs text-fg-4">No prompt</span>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-2xs text-fg-3 tabular">
          {r.model ? (
            <span className="flex items-center gap-1" title={r.model}>
              <Icon name="models" size={11} /> {shortModel(r.model)}
            </span>
          ) : null}
          {r.loras.length ? (
            <span className="flex items-center gap-1" title={r.loras.join(", ")}>
              <Icon name="layers" size={11} /> {r.loras.length} LoRA
              {r.loras.length === 1 ? "" : "s"}
            </span>
          ) : null}
          {r.width && r.height ? (
            <span>
              {r.width}×{r.height}
            </span>
          ) : null}
          {r.seed !== null ? <span>seed {r.seed}</span> : null}
          {r.durationMs !== null ? <span>{formatDuration(r.durationMs)}</span> : null}
          {rate ? (
            <Tooltip
              content={
                <span className="flex flex-col gap-0.5">
                  {r.timings.map((t) => (
                    <span key={t.label}>
                      {t.label}: {formatDuration(t.ms)}
                      {t.rate ? ` · ${t.rate.toFixed(2)} it/s` : ""}
                    </span>
                  ))}
                </span>
              }
            >
              <span className="cursor-default underline decoration-dotted underline-offset-2">
                {rate.toFixed(2)} it/s
              </span>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        <Button
          size="sm"
          variant="secondary"
          icon="refresh"
          disabled={r.kind === "batch"}
          onClick={() => onRerun(false)}
        >
          Run again
        </Button>
        <Menu
          items={[
            {
              id: "seed",
              label: "Run with a new seed",
              icon: "dice",
              onSelect: () => onRerun(true),
              disabled: r.kind === "batch",
            },
            { id: "use", label: "Use these settings", icon: "sliders", onSelect: onUse },
          ]}
          trigger={<IconButton icon="more-horizontal" label="More" tooltip={false} />}
        />
      </div>
    </div>
  );
}
