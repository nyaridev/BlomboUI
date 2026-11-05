/**
 * Switch, Checkbox, Segmented, Chip: hand-built on native buttons with ARIA roles. Knobs and
 * thumbs move by an offset inside their own control (never a layout animation, which measures
 * the page and chases the control when something above it changes height).
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { snappy } from "@client/lib/motion";
import { motion } from "motion/react";
import { type KeyboardEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react";

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
  // How far the knob travels: the inner width less the knob (sm 28 − 14, md 36 − 18).
  const travel = size === "sm" ? 14 : 18;
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
        "relative inline-flex shrink-0 items-center rounded-full border p-[1px] transition-colors focus-ring disabled:opacity-40",
        dims,
        checked ? on : "border-line-strong bg-sunken",
      )}
    >
      <motion.span
        initial={false}
        animate={{ x: checked ? travel : 0 }}
        transition={snappy}
        className={cn(
          "block rounded-full shadow-[var(--shadow-knob)]",
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
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  indeterminate?: boolean;
  /** The name when there's no visible label (a tab's checkbox). */
  ariaLabel?: string;
}) {
  const on = checked || indeterminate;
  const box = (
    <span
      className={cn(
        "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-xs border transition-colors",
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
      aria-label={ariaLabel}
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
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const group = useRef<HTMLDivElement>(null);
  const index = options.findIndex((o) => o.value === value);
  // The thumb sits under the active option: its offset and width inside the group.
  const [thumb, setThumb] = useState<{ x: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[index];
      setThumb(el ? { x: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (group.current) observer.observe(group.current);
    return () => observer.disconnect();
  }, [index]);
  // The first placement doesn't animate in from the left edge.
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (thumb) placed.current = true;
  }, [thumb]);
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
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      className={cn(
        "relative inline-flex items-center gap-0.5 rounded-md border border-line bg-sunken p-0.5",
        // w-fit: as wide as its options, even where a column would stretch it (Field).
        full ? "flex w-full" : "w-fit",
        className,
      )}
    >
      {thumb ? (
        <motion.span
          aria-hidden
          initial={false}
          animate={{ x: thumb.x, width: thumb.width }}
          transition={placed.current ? snappy : { duration: 0 }}
          className="absolute top-0.5 bottom-0.5 left-0 z-0 rounded-sm border border-line-strong bg-field shadow-[var(--shadow-card)]"
        />
      ) : null}
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
              "relative inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-colors focus-ring",
              // md is 32 px in all, like md buttons and fields beside it.
              size === "sm" ? "h-6 px-2 text-xs" : "h-[26px] px-3 text-sm",
              !opt.label && (size === "sm" ? "w-7 px-0" : "w-8 px-0"),
              full && "flex-1",
              active ? "text-fg" : "text-fg-3 hover:text-fg-2",
            )}
          >
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {opt.icon ? <Icon name={opt.icon} size={size === "sm" ? 13 : 15} /> : null}
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Segmented's look picking several: each picked option gets the raised field look (no sliding
 * thumb). `allLabel` adds a first segment that clears the picks and reads as picked while none is.
 */
export function MultiSegmented<T extends string>({
  options,
  value,
  onChange,
  allLabel,
  size = "md",
  label,
  className,
}: {
  options: SegmentOption<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  allLabel?: string;
  size?: "sm" | "md";
  label?: string;
  className?: string;
}) {
  const segment = (key: string, on: boolean, onClick: () => void, opt?: SegmentOption<T>) => (
    <button
      key={key}
      type="button"
      aria-pressed={on}
      title={opt?.title}
      aria-label={opt && !opt.label ? opt.title : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-sm border font-medium transition-colors focus-ring",
        size === "sm" ? "h-6 px-2 text-xs" : "h-[26px] px-3 text-sm",
        on
          ? "border-line-strong bg-field text-fg shadow-[var(--shadow-card)]"
          : "border-transparent text-fg-3 hover:text-fg-2",
      )}
    >
      {opt?.icon ? <Icon name={opt.icon} size={size === "sm" ? 13 : 15} /> : null}
      {opt ? opt.label : allLabel}
    </button>
  );
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex w-fit flex-wrap items-center gap-0.5 rounded-md border border-line bg-sunken p-0.5",
        className,
      )}
    >
      {allLabel ? segment(" all", value.length === 0, () => onChange([])) : null}
      {options.map((opt) =>
        segment(
          opt.value,
          value.includes(opt.value),
          () =>
            onChange(
              value.includes(opt.value)
                ? value.filter((v) => v !== opt.value)
                : [...value, opt.value],
            ),
          opt,
        ),
      )}
    </div>
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
  /** sm 24 px, md 28 px, lg 32 px (beside md buttons and fields). */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border transition-colors",
        size === "sm" ? "h-6 text-xs" : size === "lg" ? "h-8 text-sm" : "h-7 text-sm",
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
          // Fills the chip when a caller stretches it (a grid of chips).
          "inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-sm focus-ring",
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
          className="mr-1 grid h-5 w-5 place-items-center rounded-xs text-fg-3 hover:bg-field-hover hover:text-fg focus-ring"
        >
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </span>
  );
}
