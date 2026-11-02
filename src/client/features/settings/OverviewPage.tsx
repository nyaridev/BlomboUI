/**
 * Settings → Overview: the profile (name and picture edited in place) and what it has made.
 * Generated images, GPU time, speed and the most used models, LoRAs and wildcards come from the
 * job log (`/api/history/stats`); gallery size and favorites from the gallery index. The numbers
 * refresh when a run finishes (the live bus invalidates the history queries).
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useGoToView } from "@client/lib/hooks";
import { useUsageStats } from "@client/lib/queries";
import { Button, EmptyState, Panel, Skeleton, Tooltip } from "@client/ui";
import { formatDuration, type Usage, type UsageStats } from "@shared/history";
import { PageHeader, useCurrentProfile } from "./common";
import { Folders, NameField, PictureButton, Since, ThemeBadge } from "./ProfileParts";

/** Single-series horizontal ranking: one hue, values in text ink beside each bar. */
function RankList({
  title,
  icon,
  rows,
  empty,
}: {
  title: string;
  icon: IconName;
  rows: Usage[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
        <Icon name={icon} size={15} className="text-fg-3" />
        {title}
      </span>
      {rows.length === 0 ? <p className="text-xs text-fg-3">{empty}</p> : null}
      <ol className="flex flex-col gap-2.5">
        {rows.slice(0, 5).map((r, i) => (
          <li key={r.name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-3 font-mono text-2xs text-fg-4">{i + 1}</span>
                <span className="truncate text-fg-2" title={r.name}>
                  {r.name
                    .split("/")
                    .pop()
                    ?.replace(/\.(safetensors|ckpt|pt|gguf|sft)$/i, "")}
                </span>
              </span>
              <span className="font-mono text-xs text-fg-3 tabular">
                {r.count.toLocaleString()}
              </span>
            </div>
            <Tooltip content={`${r.name}: ${r.count.toLocaleString()} runs`}>
              <div className="ml-5 h-1.5 rounded-full bg-sunken">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </Tooltip>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function DayBars({ days }: { days: Array<{ day: string; count: number }> }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const label = (day: string, i: number) =>
    i === days.length - 1
      ? "Today"
      : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
  const total = days.reduce((n, d) => n + d.count, 0);
  return (
    <Panel className="col-span-full flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
          <Icon name="chart" size={15} className="text-fg-3" />
          Images per day
        </span>
        <span className="text-xs text-fg-3 tabular">
          {total.toLocaleString()} in the last {days.length} days
        </span>
      </div>
      <div className="flex h-32 items-end gap-1.5 border-b border-line">
        {days.map((d, i) => (
          <Tooltip
            key={d.day}
            content={`${new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}: ${d.count.toLocaleString()} image${d.count === 1 ? "" : "s"}`}
          >
            <div className="group flex h-full flex-1 items-end">
              <div
                className={cn(
                  "w-full rounded-t-[3px] transition-colors",
                  i === days.length - 1 ? "bg-accent" : "bg-accent/45 group-hover:bg-accent/70",
                  d.count === 0 && "min-h-px bg-line",
                )}
                style={{ height: `${(d.count / max) * 100}%` }}
              />
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="flex gap-1.5">
        {days.map((d, i) => (
          <span key={d.day} className="flex-1 text-center text-2xs text-fg-4">
            {i % 2 === days.length % 2 || i === days.length - 1 ? label(d.day, i) : ""}
          </span>
        ))}
      </div>
    </Panel>
  );
}

export function OverviewPage() {
  const profile = useCurrentProfile();
  const stats = useUsageStats();
  const s = stats.data;
  return (
    <>
      <PageHeader title="Overview" />
      {profile ? (
        <div className="mb-5 flex items-center gap-4">
          <PictureButton profile={profile} size={48} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <NameField profile={profile} />
              <ThemeBadge profile={profile} />
              <Since since={s?.firstAt ?? null} />
            </div>
            <Folders profile={profile} />
          </div>
        </div>
      ) : null}
      {stats.error ? (
        <EmptyState
          icon="errors"
          tone="warning"
          title="Couldn't read the stats"
          text={stats.error.message}
          action={<Button onClick={() => void stats.refetch()}>Try again</Button>}
        />
      ) : (
        <>
          <Panel className="mb-6">
            <StatStrip stats={s} />
          </Panel>
          <FirstRun stats={s} />
          <Activity stats={s} />
        </>
      )}
    </>
  );
}

/** The four headline numbers. */
function headlines(s: UsageStats | undefined) {
  const n = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString());
  const out: Array<{ icon: IconName; label: string; value: string; sub?: string }> = [
    {
      icon: "image",
      label: "Images generated",
      value: n(s?.generated.total),
      sub: s ? `${n(s.generated.week)} this week · ${n(s.generated.today)} today` : undefined,
    },
    {
      icon: "clock",
      label: "GPU time",
      value: s ? formatDuration(s.gpuMs.total) : "—",
      sub: s ? `${formatDuration(s.gpuMs.week)} this week` : undefined,
    },
    {
      icon: "heart",
      label: "Favorites",
      value: n(s?.gallery.favorites),
      sub: s ? `of ${n(s.gallery.images)} images in the gallery` : undefined,
    },
    {
      icon: "activity",
      label: "Speed this week",
      value: s?.rate ? `${s.rate.toFixed(2)} it/s` : "—",
      sub: s
        ? `${n(s.runs.total)} runs${s.runs.failed ? ` · ${n(s.runs.failed)} failed` : ""}`
        : undefined,
    },
  ];
  return out;
}

/** The headline numbers as one strip of cells (inside a panel). */
function StatStrip({ stats }: { stats: UsageStats | undefined }) {
  return (
    <div className="grid grid-cols-4 max-lg:grid-cols-2">
      {headlines(stats).map((t) => (
        <div
          key={t.label}
          className="flex min-w-0 flex-col gap-1.5 border-line px-4 py-3.5 not-first:border-l max-lg:border-l-0"
        >
          <span className="flex items-center gap-1.5 text-xs text-fg-3">
            <Icon name={t.icon} size={13} />
            {t.label}
          </span>
          {stats ? (
            <span className="truncate text-xl font-semibold tracking-tight text-fg tabular">
              {t.value}
            </span>
          ) : (
            <Skeleton className="h-7 w-16" />
          )}
          {t.sub ? <span className="truncate text-xs text-fg-3">{t.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Before the first run: what this page will show, and the way to Generate. */
function FirstRun({ stats }: { stats: UsageStats | undefined }) {
  const go = useGoToView();
  if (!stats || stats.runs.total > 0) return null;
  return (
    <Panel className="mb-6 flex items-center gap-4 p-5 max-lg:flex-wrap max-lg:p-4">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-field text-accent-ink">
        <Icon name="sparkle" size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-fg">Nothing generated yet</span>
        <span className="text-xs text-fg-3">
          Every run you make is counted here: images per day, GPU time and your most used models,
          LoRAs and wildcards.
        </span>
      </div>
      <Button
        variant="primary"
        icon="generate"
        onClick={() => go("generate")}
        className="max-lg:w-full"
      >
        Go to Generate
      </Button>
    </Panel>
  );
}

/** Images per day across the top, then the four "most used" lists, two per row. */
function Activity({ stats: s }: { stats: UsageStats | undefined }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 max-lg:grid-cols-1">
      {s ? <DayBars days={s.perDay} /> : <Skeleton className="col-span-full h-[210px]" />}
      <RankList
        title="Most used models"
        icon="models"
        rows={s?.models ?? []}
        empty="Models you generate with appear here."
      />
      <RankList
        title="Most used LoRAs"
        icon="layers"
        rows={s?.loras ?? []}
        empty="LoRAs from <lora:…> tags in your prompts appear here."
      />
      <RankList
        title="Most used wildcards"
        icon="wildcards"
        rows={s?.wildcards ?? []}
        empty="Wildcards like __hair__ in your prompts appear here."
      />
      <RankList
        title="Most used workflows"
        icon="workflow"
        rows={s?.workflows ?? []}
        empty="Workflows you run appear here."
      />
    </div>
  );
}
