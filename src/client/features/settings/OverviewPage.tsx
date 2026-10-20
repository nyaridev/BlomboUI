/**
 * Settings → Overview: the profile, what it has made and the settings people change most.
 * Generated images, GPU time, speed and the most used models, LoRAs and wildcards come from the
 * job log (`/api/history/stats`); gallery size and favorites from the gallery index. The numbers
 * refresh when a run finishes (the live bus invalidates the history queries).
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { avatarUrl } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useGoToView } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import { useUsageStats } from "@client/lib/queries";
import { Avatar, Badge, Button, EmptyState, Panel, Skeleton, Tooltip } from "@client/ui";
import { THEME_LABELS } from "@shared/constants";
import { formatDuration, type Usage } from "@shared/history";
import type { ReactNode } from "react";
import { PageHeader, QuickRow, useCurrentProfile } from "./common";
import type { SettingsPage } from "./nav";

function StatTile({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  icon: IconName;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <span className="flex items-center gap-1.5 text-xs text-fg-3">
        <Icon name={icon} size={13} />
        {label}
      </span>
      <span
        className="truncate text-2xl font-semibold tracking-tight text-fg tabular"
        title={value}
      >
        {value}
      </span>
      {sub ? <span className="truncate text-xs text-fg-3">{sub}</span> : null}
    </div>
  );
}

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
    <Panel className="col-span-2 flex flex-col gap-3 p-4">
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

export function OverviewPage({ onGo }: { onGo: (p: SettingsPage) => void }) {
  const profile = useCurrentProfile();
  const stats = useUsageStats();
  const comfy = useLive((st) => st.comfy);
  const go = useGoToView();
  const s = stats.data;
  const n = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString());
  return (
    <>
      <PageHeader
        title="Overview"
        text="Your profile at a glance. Counts come from the runs Blombo logged and the gallery."
      />
      <Panel className="mb-6 flex items-center gap-5 p-5">
        <Avatar
          name={profile?.name ?? "Profile"}
          src={profile ? avatarUrl(profile, profile.lastOpenedAt ?? "") : null}
          accent={profile?.accent}
          size={64}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-fg">{profile?.name ?? "…"}</span>
            <Badge tone="accent">{profile ? THEME_LABELS[profile.theme] : ""}</Badge>
            {s?.firstAt ? (
              <span className="text-xs text-fg-3">
                generating since{" "}
                {new Date(s.firstAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
            {(["models", "outputs", "wildcards"] as const).map((k) => (
              <div key={k} className="contents">
                <span className="text-fg-3 capitalize">{k}</span>
                <span className="truncate font-mono text-fg-2">
                  {profile?.paths[k] || "not set"}
                </span>
              </div>
            ))}
          </div>
        </div>
        <Button icon="edit" onClick={() => onGo("files")}>
          Edit folders
        </Button>
      </Panel>

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
          <div className="mb-6 grid grid-cols-4 gap-3">
            {stats.isLoading ? (
              Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[104px]" />)
            ) : (
              <>
                <StatTile
                  icon="image"
                  label="Images generated"
                  value={n(s?.generated.total)}
                  sub={
                    s
                      ? `${n(s.generated.week)} this week · ${n(s.generated.today)} today`
                      : undefined
                  }
                />
                <StatTile
                  icon="clock"
                  label="GPU time"
                  value={s ? formatDuration(s.gpuMs.total) : "—"}
                  sub={s ? `${formatDuration(s.gpuMs.week)} this week` : undefined}
                />
                <StatTile
                  icon="heart"
                  label="Favorites"
                  value={n(s?.gallery.favorites)}
                  sub={s ? `of ${n(s.gallery.images)} images in the gallery` : undefined}
                />
                <StatTile
                  icon="activity"
                  label="Speed this week"
                  value={s?.rate ? `${s.rate.toFixed(2)} it/s` : "—"}
                  sub={
                    s
                      ? `${n(s.runs.total)} runs${s.runs.failed ? ` · ${n(s.runs.failed)} failed` : ""}`
                      : undefined
                  }
                />
              </>
            )}
          </div>

          {s && s.runs.total === 0 ? (
            <Panel className="mb-6 flex items-center gap-4 p-5">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-field text-accent-ink">
                <Icon name="sparkle" size={18} />
              </span>
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-fg">Nothing generated yet</span>
                <span className="text-xs text-fg-3">
                  Every run you make is counted here: images per day, GPU time and your most used
                  models, LoRAs and wildcards.
                </span>
              </div>
              <Button variant="primary" icon="generate" onClick={() => go("generate")}>
                Go to Generate
              </Button>
            </Panel>
          ) : null}

          <div className="mb-6 grid grid-cols-2 gap-3">
            {s ? <DayBars days={s.perDay} /> : <Skeleton className="col-span-2 h-[210px]" />}
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
        </>
      )}

      <h2 className="label-caps mb-3">Quick settings</h2>
      <Panel className="flex flex-col divide-y divide-line">
        <QuickRow
          icon="palette"
          title="Appearance"
          text="Theme, profile color, font and motion"
          onClick={() => onGo("appearance")}
        />
        <QuickRow
          icon="folder"
          title="Folders"
          text={profile?.paths.outputs || "No outputs folder yet"}
          onClick={() => onGo("files")}
          warn={!profile?.paths.outputs}
        />
        <QuickRow
          icon="workflow"
          title="ComfyUI"
          text={
            profile?.comfy.mode === "external"
              ? `Your own at ${profile.comfy.url}`
              : `Managed · slot ${profile?.comfy.mode === "managed" ? profile.comfy.slot : "—"}${comfy?.state === "missing" ? " · not installed yet" : ""}`
          }
          onClick={() => onGo("comfy")}
          warn={comfy?.state === "missing"}
        />
        <QuickRow
          icon="bell"
          title="Notifications"
          text="Tell me when long runs, batches and downloads finish"
          onClick={() => onGo("notifications")}
        />
      </Panel>
    </>
  );
}
