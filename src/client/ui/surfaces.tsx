/**
 * Surfaces: Panel (a region), Section (titled group inside a panel), Collapsible (expandable
 * card with an optional enable switch: the Hires / ADetailer / ControlNet header pattern).
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { glide } from "@client/lib/motion";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useId, useState } from "react";
import { Switch } from "./toggles";

export function Panel({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "aside" | "main";
}) {
  return <Tag className={cn("card", className)}>{children}</Tag>;
}

export function SectionTitle({
  children,
  icon,
  actions,
  className,
}: {
  children: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {icon ? <Icon name={icon} size={14} className="text-fg-3" /> : null}
      <h3 className="label-caps flex-1">{children}</h3>
      {actions}
    </div>
  );
}

export function Collapsible({
  title,
  icon,
  subtitle,
  enabled,
  onEnabledChange,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  actions,
  children,
  tone = "surface",
  className,
}: {
  title: ReactNode;
  icon?: IconName;
  subtitle?: ReactNode;
  /** When provided, the header shows an enable switch (stage on/off). */
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  actions?: ReactNode;
  children: ReactNode;
  tone?: "surface" | "inset";
  className?: string;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const open = controlledOpen ?? inner;
  const setOpen = (v: boolean) => {
    setInner(v);
    onOpenChange?.(v);
  };
  const bodyId = useId();
  const hasSwitch = enabled !== undefined && onEnabledChange;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border transition-colors duration-200",
        tone === "surface" ? "bg-surface-2" : "bg-sunken",
        hasSwitch && enabled ? "border-accent/40" : "border-line",
        className,
      )}
    >
      <div className="flex h-11 items-center gap-2.5 pr-2 pl-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2.5 self-stretch text-left focus-ring rounded-sm"
        >
          {icon ? (
            <span
              className={cn(
                "grid h-6 w-6 place-items-center rounded-sm transition-colors",
                hasSwitch && enabled ? "bg-accent/18 text-accent-ink" : "bg-field text-fg-3",
              )}
            >
              <Icon name={icon} size={14} />
            </span>
          ) : null}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-fg">{title}</span>
            {subtitle ? <span className="truncate text-2xs text-fg-3">{subtitle}</span> : null}
          </span>
          <Icon
            name="chevron-down"
            size={15}
            className={cn(
              "ml-auto text-fg-3 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
        {actions}
        {hasSwitch ? (
          <Switch
            size="sm"
            checked={enabled}
            onCheckedChange={onEnabledChange}
            label={`Enable ${String(title)}`}
          />
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={bodyId}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={glide}
          >
            <div
              className={cn(
                "border-t border-line px-3 pt-3 pb-3.5",
                hasSwitch && !enabled && "opacity-55",
              )}
            >
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Inherit-or-override row for stage params: shows the inherited value dimmed with a link. */
export function InheritRow({
  label,
  inherited,
  overridden,
  onOverride,
  children,
}: {
  label: ReactNode;
  inherited: ReactNode;
  overridden: boolean;
  onOverride: (overridden: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-fg-2">{label}</span>
        <button
          type="button"
          onClick={() => onOverride(!overridden)}
          title={overridden ? "Use the base value again" : "Set a different value for this stage"}
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded-xs px-1.5 text-2xs font-medium transition-colors focus-ring",
            overridden
              ? "bg-accent/15 text-accent-ink"
              : "text-fg-3 hover:bg-field hover:text-fg-2",
          )}
        >
          <Icon name={overridden ? "unlink" : "link"} size={12} />
          {overridden ? "Custom" : "Base"}
        </button>
      </div>
      {overridden ? (
        children
      ) : (
        <div className="flex h-8 items-center rounded-md border border-dashed border-line px-2.5 font-mono text-sm text-fg-3">
          {inherited}
        </div>
      )}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}
