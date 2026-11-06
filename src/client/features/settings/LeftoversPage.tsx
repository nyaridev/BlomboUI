/**
 * Settings → Leftovers: what Blombo keeps for models and wildcards that aren't there anymore
 * (shared/leftovers.ts): a model's info and pictures beside a model file that's gone, pictures
 * set for wildcards no folder defines, and favorites on either. Scanned when the page opens and
 * on Scan again; everything starts picked, and Move to trash clears the picked ones (files go to
 * the profile's trash, favorites are forgotten). Folders that aren't there are named and left
 * alone.
 */
import type { IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { formatBytes } from "@client/lib/number";
import { qk, useLeftovers } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Button, Checkbox, EmptyState, Notice, Skeleton, toast } from "@client/ui";
import type { Leftover, LeftoverKind } from "@shared/leftovers";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, SettingsSection } from "./common";

const GROUPS: Array<{ kind: LeftoverKind; title: string; icon: IconName; text: string }> = [
  {
    kind: "model",
    title: "Model info and pictures",
    icon: "models",
    text: "Files kept beside a model that was moved, renamed or removed outside Blombo.",
  },
  {
    kind: "wildcard-picture",
    title: "Wildcard pictures",
    icon: "wildcards",
    text: "Pictures for wildcards no folder defines anymore.",
  },
  {
    kind: "favorite",
    title: "Favorites",
    icon: "heart",
    text: "Hearts on models or wildcards that aren't there.",
  },
];

export function LeftoversPage() {
  const report = useLeftovers();
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const items = report.data?.items ?? [];
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  // A new scan starts with everything picked.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scannedAt is the trigger
  useEffect(() => setUnpicked(new Set()), [report.data?.scannedAt]);

  const picked = items.filter((i) => !unpicked.has(i.id));
  const size = picked.reduce((n, i) => n + i.size, 0);
  const toggle = (ids: string[], on: boolean) =>
    setUnpicked((s) => {
      const next = new Set(s);
      for (const id of ids) on ? next.delete(id) : next.add(id);
      return next;
    });

  const clear = async () => {
    setClearing(true);
    try {
      const done = await api.clearLeftovers(picked.map((i) => i.id));
      const parts = [
        done.moved ? `moved ${done.moved} to the profile's trash` : null,
        done.forgotten
          ? `forgot ${done.forgotten} favorite${done.forgotten === 1 ? "" : "s"}`
          : null,
      ].filter(Boolean);
      toast(parts.length ? `Done: ${parts.join(", ")}.` : "Nothing to clear.", "success");
      await report.refetch();
      void qc.invalidateQueries({ queryKey: qk.modelMarks(profileId) });
      void qc.invalidateQueries({ queryKey: qk.wildcards(profileId) });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <PageHeader title="Leftovers" />
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-fg-3">
            What Blombo kept for models and wildcards that aren't there anymore. Files move to the
            profile's trash, so you can still put them back.
          </p>
          <Button
            size="sm"
            icon="refresh"
            loading={report.isFetching}
            onClick={() => void report.refetch()}
          >
            Scan again
          </Button>
        </div>
        {report.data?.skipped.length ? (
          <Notice
            tone="warning"
            title="Some folders weren't there, so nothing for them was checked"
          >
            <span className="font-mono text-xs">{report.data.skipped.join(" · ")}</span>
          </Notice>
        ) : null}
        {report.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : report.error ? (
          <EmptyState
            icon="errors"
            tone="warning"
            title="Couldn't look for leftovers"
            text={report.error.message}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title="Nothing left over"
            text="Every picture, info file and favorite belongs to a model or wildcard you have."
          />
        ) : (
          <>
            {GROUPS.map((g) => (
              <Group
                key={g.kind}
                group={g}
                items={items.filter((i) => i.kind === g.kind)}
                unpicked={unpicked}
                onToggle={toggle}
              />
            ))}
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 shadow-pop">
              <span className="text-sm text-fg-2 tabular">
                {picked.length} of {items.length} picked
                {size ? ` · ${formatBytes(size)}` : ""}
              </span>
              <Button
                variant="danger"
                icon="trash"
                disabled={!picked.length}
                loading={clearing}
                onClick={() => void clear()}
              >
                Move to trash
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Group({
  group,
  items,
  unpicked,
  onToggle,
}: {
  group: (typeof GROUPS)[number];
  items: Leftover[];
  unpicked: Set<string>;
  onToggle: (ids: string[], on: boolean) => void;
}) {
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  if (!items.length) return null;
  const all = ids.every((id) => !unpicked.has(id));
  return (
    <SettingsSection
      title={`${group.title} · ${items.length}`}
      icon={group.icon}
      actions={
        <Checkbox
          checked={all}
          onCheckedChange={(on) => onToggle(ids, on)}
          label={all ? "All picked" : "Pick all"}
        />
      }
    >
      <p className="text-xs text-fg-3">{group.text}</p>
      {items.map((item) => (
        <label key={item.id} className="flex cursor-pointer items-center gap-3">
          <Checkbox
            checked={!unpicked.has(item.id)}
            onCheckedChange={(on) => onToggle([item.id], on)}
            ariaLabel={`Pick ${item.name}`}
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm text-fg">{item.name}</span>
            <span className="truncate font-mono text-xs text-fg-3">{item.detail}</span>
          </span>
          {item.size ? (
            <span className="shrink-0 text-xs text-fg-3 tabular">{formatBytes(item.size)}</span>
          ) : null}
        </label>
      ))}
    </SettingsSection>
  );
}
