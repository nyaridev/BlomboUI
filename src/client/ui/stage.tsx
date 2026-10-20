/**
 * Two controls the stage blocks (Hires fix, ADetailer, ControlNet) are built from:
 *
 *  - Notice: an inline message with a status icon and the actions that fix it ("Find in
 *    Manager", "Open ComfyUI"). Status is never color alone: the icon and the words carry it.
 *  - UnitTabs: a stage's units (ADetailer and ControlNet run several in order) as small tabs
 *    with their run order, a dot for units that are off, and an add button.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { snappy } from "@client/lib/motion";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { IconButton } from "./Button";

const NOTICE_TONE = {
  info: { icon: "info", box: "border-line bg-field", ink: "text-accent-ink" },
  warning: { icon: "info", box: "border-yellow/30 bg-yellow/8", ink: "text-yellow-ink" },
  danger: { icon: "x-circle", box: "border-red/30 bg-red/8", ink: "text-red-ink" },
} as const satisfies Record<string, { icon: IconName; box: string; ink: string }>;

export function Notice({
  tone = "warning",
  title,
  children,
  actions,
  icon,
  className,
}: {
  tone?: keyof typeof NOTICE_TONE;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: IconName;
  className?: string;
}) {
  const t = NOTICE_TONE[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-2.5 rounded-md border px-3 py-2.5", t.box, className)}
    >
      <Icon name={icon ?? t.icon} size={15} className={cn("mt-0.5 shrink-0", t.ink)} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-0.5 text-xs leading-relaxed">
          {title ? <span className="font-medium text-fg">{title}</span> : null}
          {children ? <span className="text-fg-2">{children}</span> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-1.5">{actions}</div> : null}
      </div>
    </div>
  );
}

export interface UnitTab {
  id: string;
  name: string;
  /** Off units stay in the list, dimmed, and don't run. */
  enabled: boolean;
  /** Something's missing for this unit (shown as a warning mark). */
  warning?: boolean;
}

export function UnitTabs({
  units,
  active,
  onActive,
  onAdd,
  addLabel = "Add unit",
  max = 8,
  layoutGroup,
}: {
  units: UnitTab[];
  active: string;
  onActive: (id: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  max?: number;
  /** Unique per instance so two tab strips don't share the sliding indicator. */
  layoutGroup: string;
}) {
  return (
    <div role="tablist" aria-label="Units" className="flex flex-wrap items-center gap-1">
      {units.map((u, i) => {
        const selected = u.id === active;
        return (
          <button
            key={u.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onActive(u.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const next =
                units[(i + (e.key === "ArrowRight" ? 1 : units.length - 1)) % units.length];
              if (next) onActive(next.id);
            }}
            className={cn(
              "relative inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors focus-ring",
              selected ? "text-fg" : "text-fg-3 hover:bg-field hover:text-fg-2",
              !u.enabled && "opacity-55",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`unit-tab-${layoutGroup}`}
                transition={snappy}
                className="absolute inset-0 z-0 rounded-sm bg-field ring-1 ring-line-strong"
              />
            ) : null}
            <span className="relative z-10 font-mono text-[10px] text-fg-4">{i + 1}</span>
            <span className={cn("relative z-10", !u.enabled && "line-through decoration-fg-4")}>
              {u.name}
            </span>
            {u.warning ? (
              <span className="relative z-10 text-yellow-ink" title="Something's missing">
                <Icon name="info" size={11} />
              </span>
            ) : null}
          </button>
        );
      })}
      {onAdd && units.length < max ? (
        <IconButton icon="plus" label={addLabel} size="sm" onClick={onAdd} />
      ) : null}
    </div>
  );
}
