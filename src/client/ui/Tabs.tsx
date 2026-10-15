/**
 * Tabs with a sliding indicator. `pill` is the header navigation look; `line` sits on top of
 * a panel (Generate workspace, Models sub-views).
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { snappy } from "@client/lib/motion";
import { LayoutGroup, motion } from "motion/react";
import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: IconName;
  badge?: ReactNode;
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
  variant?: "pill" | "line";
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
          "flex items-center",
          variant === "pill" ? "gap-0.5" : "gap-1 border-b border-line",
          className,
        )}
      >
        {items.map((item, i) => {
          const active = item.value === value;
          return (
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
                "relative inline-flex items-center gap-2 text-sm font-medium transition-colors duration-150 focus-ring",
                variant === "pill" ? "h-8 rounded-md px-3" : "h-9 px-3",
                active ? "text-fg" : "text-fg-3 hover:text-fg-2",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="tab-indicator"
                  transition={snappy}
                  className={cn(
                    "absolute z-0",
                    variant === "pill"
                      ? "inset-0 rounded-md bg-field shadow-[inset_0_1px_0_var(--edge-hi)] ring-1 ring-line-strong"
                      : "inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-ink",
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
        })}
      </div>
    </LayoutGroup>
  );
}
