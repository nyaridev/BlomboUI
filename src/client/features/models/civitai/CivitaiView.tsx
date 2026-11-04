/**
 * Models → Civitai: the browser plus opened model tabs. The tab strip is always there, as book
 * tabs over one panel like Models → Local's kinds (`Tabs variant="folder"`'s look, with a close
 * button and middle click it doesn't have): Browse (home) first, then the opened models (a middle click closes one, as in a
 * browser; a middle click on a Browse card opens one behind), and Close all at the end. The
 * browser stays mounted (hidden) while a model tab is in front, so its scroll position and
 * loaded pages survive switching back.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { Button } from "@client/ui";
import type { MouseEvent } from "react";
import { Browse } from "./Browse";
import { ModelPage } from "./ModelPage";
import { useCivitai } from "./state";

export function CivitaiView() {
  const tabs = useCivitai((s) => s.tabs);
  const active = useCivitai((s) => s.active);
  const show = useCivitai((s) => s.show);
  const close = useCivitai((s) => s.close);
  const closeAll = useCivitai((s) => s.closeAll);
  return (
    <div className="flex min-h-0 flex-1 flex-col p-3 max-lg:p-2">
      <div className="flex shrink-0 items-end gap-2">
        <div
          role="tablist"
          aria-label="Opened Civitai models"
          className="scroll-quiet flex min-w-0 flex-1 items-end gap-1 overflow-x-auto [scrollbar-gutter:auto]"
        >
          <Tab icon="search" label="Browse" active={active === null} onSelect={() => show(null)} />
          {tabs.map((t) => (
            <Tab
              key={t.id}
              icon="layers"
              label={t.name}
              active={active === t.id}
              onSelect={() => show(t.id)}
              onClose={() => close(t.id)}
            />
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon="x"
          disabled={!tabs.length}
          onClick={closeAll}
          className="mb-1 shrink-0"
        >
          Close all
        </Button>
      </div>
      {/* One panel under the tabs (book tabs: the one in front joins it). */}
      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-surface",
          active === null && "rounded-tl-none",
        )}
      >
        <div hidden={active !== null} className="absolute inset-0 flex flex-col">
          <Browse />
        </div>
        {active !== null ? (
          <div className="absolute inset-0">
            <ModelPage key={active} id={active} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Tab({
  icon,
  label,
  active,
  onSelect,
  onClose,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onSelect: () => void;
  /** Leave out for Browse, which can't be closed. */
  onClose?: () => void;
}) {
  const middle = (e: MouseEvent) => {
    if (e.button === 1 && onClose) {
      e.preventDefault();
      onClose();
    }
  };
  return (
    <div
      onMouseDown={(e) => onClose && e.button === 1 && e.preventDefault()}
      onAuxClick={middle}
      className={cn(
        "group relative flex h-9 min-w-0 shrink-0 items-center rounded-t-md border border-b-0 border-line font-medium transition-colors",
        // A model tab is as wide as its name, up to a limit; Browse never shrinks.
        onClose && "max-w-[240px]",
        // The tab in front is a little taller and reaches 1 px into the panel, covering its line.
        active
          ? "z-10 -mb-px h-10 bg-surface text-fg"
          : "text-fg-3 hover:bg-surface/50 hover:text-fg-2",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={onSelect}
        title={label}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-2 rounded-[inherit] pl-3 text-sm focus-ring",
          onClose ? "pr-1" : "pr-3",
        )}
      >
        <Icon
          name={icon}
          size={16}
          className={cn("shrink-0", active ? "text-accent-ink" : "text-fg-3")}
        />
        <span className="min-w-0 truncate">{label}</span>
      </button>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${label}`}
          title="Close (middle click)"
          className={cn(
            "mr-1 grid size-5 shrink-0 place-items-center rounded-xs text-fg-3 transition-opacity hover:bg-fg/10 hover:text-fg focus-ring",
            // Shown on the tab in front, on hover, and always on touch screens.
            !active &&
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
          )}
        >
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </div>
  );
}
