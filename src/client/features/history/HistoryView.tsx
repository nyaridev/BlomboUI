/**
 * History (avatar menu): every download with retry, show in Models and reveal; the Civitai
 * models you opened; and your Civitai searches. All of it lives in the profile's database and
 * is trimmed to the limits in Settings → Civitai.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useGoToView } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import {
  qk,
  useCivitaiSearches,
  useCivitaiViews,
  useDownloadHistory,
  useSettings,
} from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Button, Chip, Dialog, EmptyState, ModelCard, Skeleton, Tabs, toast } from "@client/ui";
import { CIVITAI_TYPE_LABELS, civitaiKind } from "@shared/civitai";
import type { Download } from "@shared/downloads";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { DownloadRow } from "../downloads/DownloadRow";
import { openCivitaiModel, useCivitai } from "../models/civitai/state";
import { useModelsNav } from "../models/nav";

type Tab = "downloads" | "civitai";

export function HistoryView() {
  const [tab, setTab] = useState<Tab>("downloads");
  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1120px] items-end gap-4 px-8 pt-8">
        <div className="flex flex-col gap-1 pb-3">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">History</h1>
          <p className="text-sm text-fg-3">What you downloaded and looked at on Civitai.</p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1120px] border-b border-line px-8">
        <Tabs
          variant="line"
          label="History"
          value={tab}
          onChange={setTab}
          items={[
            { value: "downloads", label: "Downloads", icon: "download" },
            { value: "civitai", label: "Civitai", icon: "globe" },
          ]}
          className="border-b-0"
        />
      </div>
      <div className="min-h-0 flex-1">{tab === "downloads" ? <Downloads /> : <Civitai />}</div>
    </div>
  );
}

/* ── downloads ──────────────────────────────────────────────────────────── */

function Downloads() {
  const q = useDownloadHistory();
  const live = useLive((s) => s.downloads);
  const [confirm, setConfirm] = useState(false);
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const limit = useSettings().data?.civitai.history.downloads ?? 500;
  // Rows in the live queue are newer than the page that was loaded.
  const items = useMemo(() => {
    const byId = new Map(live.map((d) => [d.id, d]));
    const out: Download[] = [];
    for (const page of q.data?.pages ?? [])
      for (const d of page.items) out.push(byId.get(d.id) ?? d);
    return out;
  }, [q.data, live]);
  const total = q.data?.pages[0]?.total ?? 0;
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 76,
    overscan: 6,
  });
  const rows = virtual.getVirtualItems();
  const last = rows[rows.length - 1]?.index ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (last >= items.length - 10 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [last, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (q.isLoading)
    return (
      <div className="mx-auto flex max-w-[1120px] flex-col gap-2 px-8 py-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  if (q.error)
    return (
      <EmptyState
        icon="errors"
        tone="warning"
        title="Couldn't read the download history"
        text={q.error.message}
        action={<Button onClick={() => void q.refetch()}>Try again</Button>}
      />
    );
  if (!items.length)
    return (
      <EmptyState
        icon="download"
        title="No downloads yet"
        text="Models you download from Civitai or install from the Manager show up here, with retry and reveal."
      />
    );
  return (
    <div ref={scroller} className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto max-w-[1120px] px-8 py-5">
        <div className="mb-3 flex items-center gap-2 text-xs text-fg-3">
          <span className="tabular">
            {total.toLocaleString()} download{total === 1 ? "" : "s"} · keeps the last{" "}
            {limit.toLocaleString()}
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            className="ml-auto"
            onClick={() => setConfirm(true)}
          >
            Clear finished
          </Button>
        </div>
        <div
          className="relative overflow-hidden rounded-lg border border-line bg-surface"
          style={{ height: virtual.getTotalSize() }}
        >
          {rows.map((v) => {
            const d = items[v.index];
            if (!d) return null;
            return (
              <div
                key={d.id}
                ref={virtual.measureElement}
                data-index={v.index}
                className="absolute inset-x-0 top-0 border-b border-line last:border-b-0"
                style={{ transform: `translateY(${v.start}px)` }}
              >
                <DownloadRow d={d} />
              </div>
            );
          })}
        </div>
      </div>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Clear the download history?"
        description="Finished, failed and cancelled downloads leave the list. The files stay in your models folder."
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep them
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                void api
                  .clearDownloadHistory()
                  .then(() => qc.invalidateQueries({ queryKey: qk.downloadHistory(profileId) }))
                  .then(() => toast("Download history cleared", "success"))
                  .catch((e: Error) => toast(e.message, "error"));
                setConfirm(false);
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

/* ── Civitai ────────────────────────────────────────────────────────────── */

function Civitai() {
  const views = useCivitaiViews();
  const searches = useCivitaiSearches();
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  const goTo = useGoToView();
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const setFilter = useCivitai((s) => s.setFilter);
  const show = useCivitai((s) => s.show);

  const searchFor = (query: string) => {
    setFilter({ query, username: "" });
    show(null);
    openModels();
  };
  const openModels = () => {
    useModelsNav.getState().setTab("civitai");
    goTo("models");
  };

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-8 px-8 py-6">
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="label-caps">Searches</h2>
            {searches.data?.length ? (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  void api
                    .forgetCivitaiSearch()
                    .then(() => qc.invalidateQueries({ queryKey: qk.civitaiSearches(profileId) }))
                }
              >
                Forget searches
              </Button>
            ) : null}
          </div>
          {searches.data?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {searches.data.map((s) => (
                <Chip key={s.query} size="sm" icon="search" onClick={() => searchFor(s.query)}>
                  {s.query}
                </Chip>
              ))}
            </div>
          ) : (
            <p className="text-sm text-fg-3">Searches you run in Models → Civitai appear here.</p>
          )}
        </section>
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="label-caps">Models you opened</h2>
            {views.data?.length ? (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() =>
                  void api
                    .clearCivitaiViews()
                    .then(() => qc.invalidateQueries({ queryKey: qk.civitaiViews(profileId) }))
                }
              >
                Clear
              </Button>
            ) : null}
          </div>
          {views.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : views.data?.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {views.data.map((v) => (
                <ModelCard
                  key={v.modelId}
                  name={v.name}
                  kind={civitaiKind(v.type) ?? "checkpoints"}
                  thumb={v.image?.thumb ?? null}
                  nsfw={v.image?.nsfw}
                  blurNsfw={blurNsfw}
                  typeLabel={CIVITAI_TYPE_LABELS[v.type] ?? v.type}
                  onClick={() => {
                    openCivitaiModel(v.modelId, v.name);
                    goTo("models");
                  }}
                  footer={
                    <span className="flex items-center gap-1 text-2xs text-fg-3">
                      <Icon name="clock" size={11} />
                      {new Date(v.viewedAt).toLocaleDateString()}
                      {v.creator ? <span className="ml-auto truncate">{v.creator}</span> : null}
                    </span>
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-fg-3">
              Civitai models you open in Blombo appear here, newest first.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
