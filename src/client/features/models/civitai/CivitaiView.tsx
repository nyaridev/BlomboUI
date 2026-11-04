/**
 * Models → Civitai: the browser plus opened model tabs. The tab strip is always there: Browse
 * (home) first, then the opened models (a middle click closes one, as in a browser; a middle
 * click on a Browse card opens one behind), and Close all at the end. Three looks are on trial
 * (`useVariant`). The browser stays mounted (hidden) while a model tab is in front, so its scroll
 * position and loaded pages survive switching back.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useVariant } from "@client/lib/variants";
import { Button } from "@client/ui";
import type { MouseEvent } from "react";
import { Browse } from "./Browse";
import { ModelPage } from "./ModelPage";
import { useCivitai } from "./state";

const STRIP_LOOKS = [
  { id: "browser", label: "Browser tabs" },
  { id: "chips", label: "Chips" },
  { id: "line", label: "Underline" },
] as const;
type Look = (typeof STRIP_LOOKS)[number]["id"];

export function CivitaiView() {
  const tabs = useCivitai((s) => s.tabs);
  const active = useCivitai((s) => s.active);
  const show = useCivitai((s) => s.show);
  const close = useCivitai((s) => s.close);
  const closeAll = useCivitai((s) => s.closeAll);
  const look = useVariant("civitai-tabs", "Civitai tabs", STRIP_LOOKS);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-line max-lg:px-3",
          look === "browser" && "items-end bg-sunken px-3 pt-1.5",
          look === "chips" && "bg-surface px-5 py-1.5",
          look === "line" && "px-5",
        )}
      >
        <div
          role="tablist"
          aria-label="Opened Civitai models"
          className={cn(
            "scroll-quiet flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-gutter:auto]",
            look === "browser" ? "items-end" : "items-center",
          )}
        >
          <Tab
            look={look}
            icon="search"
            label="Browse"
            active={active === null}
            onSelect={() => show(null)}
          />
          {tabs.map((t) => (
            <Tab
              key={t.id}
              look={look}
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
          className={cn("shrink-0", look === "browser" && "mb-1")}
        >
          Close all
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
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
  look,
  icon,
  label,
  active,
  onSelect,
  onClose,
}: {
  look: Look;
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
        "group relative flex min-w-0 shrink-0 items-center transition-colors",
        // A model tab is as wide as its name, up to a limit; Browse never shrinks.
        onClose && "max-w-[220px]",
        look === "browser" &&
          cn(
            "h-8 rounded-t-md border border-b-0",
            active
              ? "-mb-px h-9 border-line bg-bg text-fg"
              : "border-transparent text-fg-3 hover:bg-surface hover:text-fg-2",
          ),
        look === "chips" &&
          cn(
            "h-7 rounded-sm border text-xs",
            active
              ? "border-accent/60 bg-accent/12 text-fg"
              : "border-line bg-field text-fg-2 hover:border-line-strong hover:text-fg",
          ),
        look === "line" && cn("h-10 text-sm", active ? "text-fg" : "text-fg-3 hover:text-fg-2"),
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={onSelect}
        title={label}
        className={cn(
          "flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[inherit] focus-ring",
          look === "chips" ? "pl-2.5" : "pl-3",
          onClose ? "pr-1" : look === "chips" ? "pr-2.5" : "pr-3",
          look !== "chips" && "text-sm",
        )}
      >
        <Icon
          name={icon}
          size={look === "chips" ? 12 : 14}
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
      {look === "line" && active ? (
        <span className="pointer-events-none absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-ink" />
      ) : null}
    </div>
  );
}
