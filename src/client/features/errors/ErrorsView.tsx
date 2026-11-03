/**
 * Errors (avatar menu, header badge): everything that went wrong in this profile, kept in its
 * database (services/history.ts) so it survives a reload: failed runs, ComfyUI crashes, script
 * follow-ups. Opening the view marks the header badge as read; Clear removes rows for good.
 */

import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { type Clock, useClock } from "@client/lib/clock";
import { cn } from "@client/lib/cn";
import { dismissErrors, useLive } from "@client/lib/live";
import { useErrorLog } from "@client/lib/queries";
import {
  Badge,
  Button,
  CopyButton,
  EmptyState,
  IconButton,
  Segmented,
  Skeleton,
  toast,
} from "@client/ui";
import type { AppError } from "@shared/live";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

const SOURCES: Record<AppError["source"], { label: string; icon: IconName }> = {
  job: { label: "Generate", icon: "generate" },
  comfy: { label: "ComfyUI", icon: "workflow" },
  server: { label: "Blombo", icon: "info" },
};

type Filter = "all" | AppError["source"];

function when(at: number, clock: Clock): string {
  const sameDay = new Date(at).toDateString() === new Date().toDateString();
  return sameDay ? clock.time(at, true) : clock.dateTime(at);
}

export function ErrorsView() {
  const log = useErrorLog();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const unread = useLive((s) => s.errors.length);

  // Seeing them here counts as reading them: the header badge goes away.
  useEffect(() => {
    if (unread) dismissErrors();
  }, [unread]);

  const items = useMemo(
    () => (log.data ?? []).filter((e) => filter === "all" || e.source === filter),
    [log.data, filter],
  );

  const clear = async (ids?: string[]) => {
    try {
      const { removed } = await api.clearErrorLog(ids);
      void qc.invalidateQueries({ queryKey: ["error-log"] });
      if (!ids) toast(`Cleared ${removed} error${removed === 1 ? "" : "s"}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-8 pt-8 pb-16 max-lg:px-3 max-lg:pt-4">
        <div className="flex items-end gap-4 max-lg:flex-wrap max-lg:gap-2">
          <div className="flex flex-1 flex-col gap-1 max-lg:basis-full">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">Errors</h1>
          </div>
          <Segmented
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "job", label: "Generate" },
              { value: "comfy", label: "ComfyUI" },
              { value: "server", label: "Blombo" },
            ]}
          />
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            disabled={!log.data?.length}
            onClick={() => void clear()}
          >
            Clear all
          </Button>
        </div>

        {log.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : log.error ? (
          <EmptyState
            icon="errors"
            tone="warning"
            title="Couldn't read the error log"
            text={log.error.message}
            action={<Button onClick={() => void log.refetch()}>Try again</Button>}
          />
        ) : !items.length ? (
          <EmptyState
            icon="check-circle"
            title={filter === "all" ? "No errors" : "No errors of this kind"}
            text="When a run fails or ComfyUI stops unexpectedly, the details land here and the header shows a red badge."
          />
        ) : (
          <ol className="flex flex-col gap-2">
            {items.map((e) => (
              <ErrorRow key={e.id} error={e} onClear={() => void clear([e.id])} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function ErrorRow({ error, onClear }: { error: AppError; onClear: () => void }) {
  const clock = useClock();
  const [open, setOpen] = useState(false);
  const source = SOURCES[error.source];
  const long = error.detail.length > 220 || error.detail.includes("\n");
  const text = `${error.title}\n${error.detail}\n${new Date(error.at).toISOString()}`;
  return (
    <li className="group flex gap-3 rounded-lg border border-line bg-surface px-4 py-3">
      <Icon name="x-circle" size={17} className="mt-0.5 shrink-0 text-red-ink" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">{error.title}</span>
          <Badge>
            <Icon name={source.icon} size={11} /> {source.label}
          </Badge>
          <span className="ml-auto font-mono text-2xs text-fg-4 tabular">
            {when(error.at, clock)}
          </span>
        </div>
        {error.detail ? (
          <p
            className={cn(
              "font-mono text-xs break-words whitespace-pre-wrap text-fg-2",
              long && !open && "line-clamp-2",
            )}
          >
            {error.detail}
          </p>
        ) : null}
        {long ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="self-start text-xs text-accent-ink hover:underline focus-ring"
          >
            {open ? "Show less" : "Show all"}
          </button>
        ) : null}
      </div>
      <div className="flex items-start gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <CopyButton text={text} label="Copy error" size="sm" />
        <IconButton icon="x" label="Clear this error" size="sm" onClick={onClear} />
      </div>
    </li>
  );
}
