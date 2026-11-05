/**
 * A Most used view: the models, LoRAs, wildcards or tags you use, most used first, as a grid of
 * the same crossfading cards Home shows in rows.
 */
import { useGalleryUses } from "@client/lib/queries";
import { Button, EmptyState, Skeleton } from "@client/ui";
import type { UseKind } from "@shared/gallery";
import { SidebarButton } from "../Sidebar";
import { emptyText, USE_ICON, USE_LABEL, UseCard } from "./sections";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3";

export function UsesView({ kind, visible }: { kind: UseKind; visible: boolean }) {
  const uses = useGalleryUses(kind);
  return (
    <>
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-5 max-lg:px-3">
        <SidebarButton />
        <h1 className="text-sm font-semibold text-fg">{`Most used ${kind === "loras" ? "LoRAs" : USE_LABEL[kind].toLowerCase()}`}</h1>
        {uses.data?.length ? (
          <span className="font-mono text-xs text-fg-3 tabular">{uses.data.length}</span>
        ) : null}
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {uses.isLoading ? (
          <div className={`mx-auto max-w-[1400px] px-6 py-5 ${GRID}`}>
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/5]" />
            ))}
          </div>
        ) : uses.error ? (
          <EmptyState
            icon="errors"
            tone="warning"
            title="This list couldn't load"
            text={uses.error.message}
            action={<Button onClick={() => void uses.refetch()}>Try again</Button>}
          />
        ) : !uses.data?.length ? (
          <EmptyState icon={USE_ICON[kind]} title="Nothing yet" text={emptyText(kind)} />
        ) : (
          <div className={`mx-auto max-w-[1400px] px-6 py-5 max-lg:px-3 ${GRID}`}>
            {uses.data.map((u, i) => (
              <UseCard key={u.name} kind={kind} use={u} active={visible} index={i} size="fill" />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
