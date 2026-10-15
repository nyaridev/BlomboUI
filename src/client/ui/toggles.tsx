/** Switch, Checkbox, Segmented, Chip: hand-built on native buttons with ARIA roles. */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { snappy } from "@client/lib/motion";
import { LayoutGroup, motion } from "motion/react";
import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";

/* ── Switch ──────────────────────────────────────────────────────────────── */

export function Switch({
  checked,
  onCheckedChange,
  label,
  size = "md",
  disabled,
  tone = "accent",
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  tone?: "accent" | "generate";
}) {
  const dims = size === "sm" ? "h-[18px] w-8" : "h-[22px] w-10";
  const thumb = size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";
  const on = tone === "generate" ? "bg-generate border-generate" : "bg-accent border-accent";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full border p-[1px] transition-colors duration-150 focus-ring disabled:opacity-40",
        dims,
        checked ? on : "border-line-strong bg-sunken",
        checked ? "justify-end" : "justify-start",
      )}
    >
      <motion.span
        layout
        transition={snappy}
        className={cn(
          "block rounded-full shadow-[0_1px_2px_rgb(0_0_0/.4)]",
          thumb,
          checked ? "bg-white" : "bg-fg-3",
        )}
      />
    </button>
  );
}

/* ── Checkbox ────────────────────────────────────────────────────────────── */

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  indeterminate,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  indeterminate?: boolean;
}) {
  const on = checked || indeterminate;
  const box = (
    <span
      className={cn(
        "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-xs border transition-colors duration-150",
        on
          ? "border-accent bg-accent text-on-accent"
          : "border-line-strong bg-sunken group-hover:border-fg-4",
      )}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
        {indeterminate ? (
          <motion.path
            d="M6 12h12"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: 1 }}
          />
        ) : (
          <motion.path
            d="m5.5 12.5 4 4 9-9.5"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={{ duration: 0.16 }}
          />
        )}
      </svg>
    </span>
  );
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="group inline-flex items-start gap-2.5 text-left focus-ring rounded-xs disabled:opacity-40"
    >
      <span className="mt-px">{box}</span>
      {label ? (
        <span className="flex flex-col">
          <span className="text-sm text-fg">{label}</span>
          {description ? <span className="text-xs text-fg-3">{description}</span> : null}
        </span>
      ) : null}
    </button>
  );
}

/* ── Segmented ───────────────────────────────────────────────────────────── */

export interface SegmentOption<T extends string> {
  value: T;
  label?: ReactNode;
  icon?: IconName;
  title?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  full,
  label,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  full?: boolean;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    const opt = options[next];
    if (!opt) return;
    onChange(opt.value);
    refs.current[next]?.focus();
  };
  return (
    <LayoutGroup id={id}>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md border border-line bg-sunken p-0.5",
          full && "flex w-full",
          className,
        )}
      >
        {options.map((opt, i) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              ref={(n) => {
                refs.current[i] = n;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              title={opt.title}
              aria-label={opt.label ? undefined : opt.title}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "relative inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-colors duration-150 focus-ring",
                size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-3 text-sm",
                !opt.label && (size === "sm" ? "w-7 px-0" : "w-8 px-0"),
                full && "flex-1",
                active ? "text-fg" : "text-fg-3 hover:text-fg-2",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="thumb"
                  transition={snappy}
                  className="absolute inset-0 z-0 rounded-sm border border-line-strong bg-field shadow-[inset_0_1px_0_var(--edge-hi),0_1px_2px_rgb(0_0_0/.25)]"
                />
              ) : null}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                {opt.icon ? <Icon name={opt.icon} size={size === "sm" ? 13 : 15} /> : null}
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/* ── Chip ────────────────────────────────────────────────────────────────── */

export function Chip({
  children,
  selected,
  onClick,
  onRemove,
  icon,
  count,
  size = "md",
  className,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  icon?: IconName;
  count?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border transition-colors duration-150",
        size === "sm" ? "h-6 text-xs" : "h-7 text-sm",
        selected
          ? "border-accent/60 bg-accent/15 text-fg"
          : "border-line bg-field text-fg-2 hover:border-line-strong hover:text-fg",
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={onClick ? Boolean(selected) : undefined}
        onClick={onClick}
        className={cn(
          "inline-flex h-full items-center gap-1.5 rounded-full focus-ring",
          size === "sm" ? "px-2.5" : "px-3",
          onRemove && "pr-1",
        )}
      >
        {icon ? <Icon name={icon} size={size === "sm" ? 12 : 14} /> : null}
        {children}
        {count !== undefined ? (
          <span className="font-mono text-2xs text-fg-3 tabular">{count}</span>
        ) : null}
      </button>
      {onRemove ? (
        <button
          type="button"
          aria-label="Remove"
          onClick={onRemove}
          className="mr-1 grid h-5 w-5 place-items-center rounded-full text-fg-3 hover:bg-field-hover hover:text-fg focus-ring"
        >
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </span>
  );
}
