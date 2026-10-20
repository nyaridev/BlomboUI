/**
 * Models → Manager: the ComfyUI model catalog as a store. Categories with counts, search, sizes,
 * installed state, and one-click install through the same download queue as Civitai, into the
 * ComfyUI folder the catalog names. The list is virtualized (the catalog has hundreds of files).
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useLive } from "@client/lib/live";
import { formatBytes } from "@client/lib/number";
import { qk, useCatalog, useStartDownload } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  ProgressBar,
  Skeleton,
  TextField,
  Tooltip,
  toast,
} from "@client/ui";
import {
  type CatalogEntry,
  STORE_CATEGORIES,
  STORE_CATEGORY_LABELS,
  type StoreCategory,
} from "@shared/manager";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { useModelsNav } from "./nav";

const CATEGORY_ICON: Record<StoreCategory, IconName> = {
  checkpoints: "models",
  diffusion: "models",
  loras: "layers",
  vae: "wave",
  "text-encoders": "text",
  upscalers: "upscale",
  controlnet: "pose",
  detectors: "face-scan",
  face: "face-scan",
  "ip-adapter": "image",
  video: "play",
  other: "stack",
};

type Filter = StoreCategory | "all" | "installed";
type Row =
  | { type: "header"; category: StoreCategory; count: number }
  | { type: "entry"; entry: CatalogEntry };

const ROW_H = 68;
const HEADER_H = 40;

export function ManagerStore() {
  const catalog = useCatalog();
  // A deep link ("Find in Manager" from a stage) picks the category and search once.
  const [link] = useState(() => useModelsNav.getState().takeManager());
  const [filter, setFilter] = useState<Filter>(link?.category ?? "all");
  const [query, setQuery] = useState(link?.query ?? "");
  const pending = useModelsNav((s) => s.manager);
  useEffect(() => {
    if (!pending) return;
    const next = useModelsNav.getState().takeManager();
    if (next) {
      setFilter(next.category);
      setQuery(next.query);
    }
  }, [pending]);
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const entries = catalog.data?.entries ?? [];

  const counts = useMemo(() => {
    const c = new Map<Filter, number>([
      ["all", entries.length],
      ["installed", entries.filter((e) => e.installed).length],
    ]);
    for (const e of entries) c.set(e.category, (c.get(e.category) ?? 0) + 1);
    return c;
  }, [entries]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = entries.filter(
      (e) =>
        (filter === "all" || (filter === "installed" ? e.installed : e.category === filter)) &&
        (!q ||
          `${e.name} ${e.filename} ${e.type} ${e.base ?? ""} ${e.description}`
            .toLowerCase()
            .includes(q)),
    );
    const out: Row[] = [];
    for (const category of STORE_CATEGORIES) {
      const group = shown.filter((e) => e.category === category);
      if (!group.length) continue;
      if (filter === "all" || filter === "installed")
        out.push({ type: "header", category, count: group.length });
      for (const entry of group) out.push({ type: "entry", entry });
    }
    return out;
  }, [entries, filter, query]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      qc.setQueryData(qk.catalog(profileId), await api.catalog(true));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setRefreshing(false);
    }
  };

  if (catalog.isLoading)
    return (
      <div className="flex flex-col gap-2 p-5">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  if (catalog.error || !catalog.data)
    return (
      <EmptyState
        icon="store"
        tone="warning"
        title="Couldn't load the ComfyUI model catalog"
        text={catalog.error?.message ?? "Try again in a moment."}
        action={<Button onClick={() => void catalog.refetch()}>Try again</Button>}
      />
    );

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[232px] shrink-0 flex-col gap-0.5 border-r border-line p-3">
        <TextField
          size="sm"
          icon="search"
          placeholder="Search the catalog"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          className="mb-2"
          aria-label="Search the catalog"
        />
        {(["all", "installed", ...STORE_CATEGORIES] as Filter[])
          .filter((c) => c === "all" || c === "installed" || counts.get(c))
          .map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              aria-pressed={filter === c}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2.5 text-sm focus-ring",
                filter === c ? "bg-field text-fg" : "text-fg-2 hover:bg-field/60",
              )}
            >
              <Icon
                name={c === "all" ? "stack" : c === "installed" ? "check-circle" : CATEGORY_ICON[c]}
                size={14}
                className={filter === c ? "text-accent-ink" : "text-fg-3"}
              />
              <span className="truncate">
                {c === "all"
                  ? "Everything"
                  : c === "installed"
                    ? "Installed"
                    : STORE_CATEGORY_LABELS[c]}
              </span>
              <span className="ml-auto font-mono text-2xs text-fg-3">{counts.get(c) ?? 0}</span>
            </button>
          ))}
        <div className="mt-auto flex items-center gap-1.5 border-t border-line pt-2.5 text-2xs text-fg-3">
          <span className="flex-1">
            {catalog.data.stale ? (
              <span className="text-warning">Offline copy from </span>
            ) : (
              "Catalog from "
            )}
            {new Date(catalog.data.fetchedAt).toLocaleDateString()}
          </span>
          <IconButton
            icon="refresh"
            label="Get the newest catalog"
            size="xs"
            disabled={refreshing}
            onClick={() => void refresh()}
          />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {catalog.data.noModelsFolder ? (
          <p className="flex items-center gap-2 border-b border-line bg-yellow/10 px-5 py-2 text-xs text-warning">
            <Icon name="info" size={13} />
            This profile has no models folder, so nothing can be installed. Choose one in Settings →
            Folders.
          </p>
        ) : null}
        {rows.length ? (
          <List rows={rows} noFolder={catalog.data.noModelsFolder} />
        ) : (
          <EmptyState
            icon="search"
            title={
              filter === "installed"
                ? "Nothing from the catalog is installed yet"
                : "Nothing matches"
            }
            text={
              filter === "installed"
                ? "Install upscalers, detectors and more with one click from the other categories."
                : "Try another word or category."
            }
          />
        )}
      </div>
    </div>
  );
}

function List({ rows, noFolder }: { rows: Row[]; noFolder: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (i) => (rows[i]?.type === "header" ? HEADER_H : ROW_H),
    overscan: 8,
  });
  return (
    <div ref={scroller} className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 pb-5">
      <div className="relative w-full" style={{ height: virtual.getTotalSize() }}>
        {virtual.getVirtualItems().map((v) => {
          const row = rows[v.index];
          if (!row) return null;
          return (
            <div
              key={v.key}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${v.start}px)`, height: v.size }}
            >
              {row.type === "header" ? (
                <h3 className="label-caps flex h-full items-end gap-2 pb-2">
                  {STORE_CATEGORY_LABELS[row.category]}
                  <span className="font-mono text-fg-4">{row.count}</span>
                </h3>
              ) : (
                <EntryRow entry={row.entry} noFolder={noFolder} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EntryRow({ entry: e, noFolder }: { entry: CatalogEntry; noFolder: boolean }) {
  const live = useLive((s) =>
    s.downloads.find((d) => d.entryId === e.id && d.state !== "done" && d.state !== "cancelled"),
  );
  const progress = useLive((s) => (live ? s.downloadProgress[live.id] : undefined));
  const start = useStartDownload();
  const fraction =
    live && (progress?.size ?? live.size)
      ? (progress?.received ?? live.received) / ((progress?.size ?? live.size) as number)
      : null;
  return (
    <div className="flex h-[60px] items-center gap-3 rounded-lg border border-line bg-surface px-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-field text-fg-2">
        <Icon name={CATEGORY_ICON[e.category]} size={17} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-fg" title={e.name}>
            {e.name}
          </span>
          {e.base ? <Badge className="shrink-0">{e.base}</Badge> : null}
          {e.folder && !e.standard ? (
            <Tooltip
              content={`ComfyUI finds files in ${e.folder}/ only through a custom node that reads it.`}
            >
              <span>
                <Badge className="shrink-0">Custom node folder</Badge>
              </span>
            </Tooltip>
          ) : null}
        </div>
        <span className="truncate text-2xs text-fg-3" title={e.description}>
          {[
            e.size ? formatBytes(e.size) : null,
            e.folder ? `${e.folder}/${e.filename}` : e.filename,
            e.host,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <div className="flex w-44 shrink-0 items-center justify-end gap-1.5">
        {e.installed ? (
          <Badge tone="success">
            <Icon name="check" size={11} /> Installed
          </Badge>
        ) : live &&
          (live.state === "running" || live.state === "queued" || live.state === "paused") ? (
          <>
            <div className="flex w-28 flex-col gap-1">
              <ProgressBar
                size="sm"
                value={live.state === "queued" ? 0 : fraction}
                label={`Installing ${e.name}`}
              />
              <span className="text-2xs text-fg-3 tabular">
                {live.state === "queued"
                  ? "Waiting"
                  : live.state === "paused"
                    ? "Paused"
                    : `${Math.round((fraction ?? 0) * 100)}%`}
              </span>
            </div>
            <IconButton
              icon="x"
              label="Cancel"
              size="xs"
              onClick={() =>
                void api.cancelDownload(live.id).catch((x: Error) => toast(x.message, "error"))
              }
            />
          </>
        ) : live?.state === "error" ? (
          <Tooltip content={live.error ?? "The download failed."}>
            <Button
              size="sm"
              icon="refresh"
              variant="outline"
              onClick={() =>
                void api.resumeDownload(live.id).catch((x: Error) => toast(x.message, "error"))
              }
            >
              Retry
            </Button>
          </Tooltip>
        ) : !e.folder || noFolder ? (
          <Tooltip
            content={
              noFolder
                ? "Choose a models folder in Settings → Folders first."
                : "This file goes into a custom node's folder. Install it with ComfyUI Manager."
            }
          >
            <span>
              <Button size="sm" icon="download" disabled>
                Install
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button
            size="sm"
            icon="download"
            loading={start.isPending}
            onClick={() =>
              start.mutate(
                { source: "manager", entryId: e.id },
                {
                  onSuccess: () => toast(`Installing ${e.name}`, "info"),
                  onError: (x) => toast(x.message, "error"),
                },
              )
            }
          >
            Install
          </Button>
        )}
      </div>
    </div>
  );
}
