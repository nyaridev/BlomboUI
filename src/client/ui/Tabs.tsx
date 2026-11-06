/**
 * Tabs. `pill` is the header navigation look and `line` sits on top of a panel (Models
 * sub-views), both with a sliding indicator; `chip` is the Generate passes' look (separate
 * bordered chips that wrap), with the indicator too; `folder` is book tabs (the
 * Generate workspace): each tab is a box with its top and sides drawn, and the active one is a
 * little taller, `bg-surface`, and joins the `bg-surface` panel placed right under the tabs
 * (the panel draws the line; give its corner under the first tab `rounded-tl-none`). A tab with `checked` gets a checkbox before
 * its label that turns its view on or off (the Generate passes: Hires fix, ADetailer…); the
 * checkbox is the tab's sibling, not inside the tab button. A tab with `menu` gets a small
 * chevron at its right end that opens a menu (the header's Generate tab: Generate or Compare);
 * the chevron is a sibling too, so the tab itself still switches with one click.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { snappy } from "@client/lib/motion";
import { LayoutGroup, motion } from "motion/react";
import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import { Menu, type MenuEntry } from "./floating";
import { Checkbox } from "./toggles";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
  badge?: ReactNode;
  /** Shows a checkbox before the label; its name is "Use <label>" unless `checkLabel` says. */
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  checkLabel?: string;
  /** A chevron after the label that opens these entries; `menuLabel` names it. */
  menu?: MenuEntry[];
  menuLabel?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  variant = "pill",
  label,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: "pill" | "line" | "folder" | "chip";
  label?: string;
  className?: string;
}) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + items.length) % items.length;
    refs.current[next]?.focus();
    const item = items[next];
    if (item) onChange(item.value);
  };
  return (
    <LayoutGroup id={id}>
      <div
        role="tablist"
        aria-label={label}
        className={cn(
          // Narrow screens: tabs that don't fit scroll sideways instead of being cut off.
          "flex items-center max-lg:scroll-quiet max-lg:overflow-x-auto",
          variant === "pill"
            ? "gap-0.5"
            : variant === "folder"
              ? "items-end gap-1"
              : variant === "chip"
                ? // Chips that don't fit wrap to a second row (the passes sit in a narrow column).
                  "flex-wrap gap-1.5"
                : "gap-1 border-b border-line",
          className,
        )}
      >
        {items.map((item, i) => {
          const active = item.value === value;
          const checkable = item.checked !== undefined;
          const menu = item.menu?.length ? item.menu : null;
          const tab = (
            <button
              key={item.value}
              ref={(n) => {
                refs.current[i] = n;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(item.value)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-2 text-sm font-medium transition-colors focus-ring",
                variant === "pill"
                  ? "h-8 rounded-md px-3"
                  : variant === "chip"
                    ? cn(
                        "h-8 rounded-md border px-2.5",
                        active
                          ? "border-transparent"
                          : "border-line bg-surface-2 hover:border-line-strong",
                      )
                    : "h-9 px-3",
                // The active tab reaches 1 px into the panel below and covers its top line.
                variant === "folder" &&
                  (active
                    ? "z-10 -mb-px h-10 rounded-t-md border border-b-0 border-line bg-surface"
                    : "rounded-t-md border border-b-0 border-line hover:bg-surface/50"),
                checkable && (variant === "chip" ? "pl-8" : "pl-9"),
                menu && "pr-7",
                active ? "text-fg" : "text-fg-3 hover:text-fg-2",
              )}
            >
              {active && variant !== "folder" ? (
                <motion.span
                  layoutId="tab-indicator"
                  transition={snappy}
                  className={cn(
                    "absolute z-0",
                    variant === "pill"
                      ? "inset-0 rounded-md bg-field shadow-[inset_0_1px_0_var(--edge-hi)] ring-1 ring-line-strong"
                      : variant === "chip"
                        ? "inset-0 rounded-md bg-field ring-1 ring-accent-ink/60"
                        : "inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-ink max-lg:bottom-0",
                  )}
                />
              ) : null}
              <span className="relative z-10 inline-flex items-center gap-2">
                {item.icon ? (
                  <Icon
                    name={item.icon}
                    size={16}
                    className={active ? "text-accent-ink" : undefined}
                  />
                ) : null}
                {item.label}
                {item.badge}
              </span>
            </button>
          );
          if (menu)
            return (
              <span key={item.value} className="relative inline-flex shrink-0">
                {tab}
                <Menu
                  placement="bottom-start"
                  items={menu}
                  trigger={
                    <button
                      type="button"
                      aria-label={item.menuLabel ?? "More views"}
                      className={cn(
                        "absolute top-1/2 right-1 z-20 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm transition-colors focus-ring",
                        active
                          ? "text-fg-3 hover:bg-surface-2 hover:text-fg"
                          : "text-fg-4 hover:text-fg-2",
                      )}
                    >
                      <Icon name="chevron-down" size={13} />
                    </button>
                  }
                />
              </span>
            );
          if (!checkable) return tab;
          return (
            <span key={item.value} className="relative inline-flex shrink-0">
              {tab}
              <span
                className={cn(
                  "absolute top-1/2 z-20 -translate-y-1/2",
                  variant === "chip" ? "left-2.5" : "left-3",
                )}
              >
                <Checkbox
                  checked={Boolean(item.checked)}
                  onCheckedChange={(v) => item.onCheckedChange?.(v)}
                  ariaLabel={
                    item.checkLabel ??
                    (typeof item.label === "string" ? `Use ${item.label}` : "Use")
                  }
                />
              </span>
            </span>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
