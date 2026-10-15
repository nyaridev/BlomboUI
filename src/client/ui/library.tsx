/**
 * Library controls (Phase 2): the pieces the gallery, File Info, Models and the Wildcard
 * Manager share. EmptyState, DropZone, Veil (NSFW blur with click to reveal), ProgressBar,
 * CopyButton, PropertyList and TreeRow. All of them are shown in the Design Lab.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { glide } from "@client/lib/motion";
import { motion } from "motion/react";
import {
  type DragEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useRef,
  useState,
} from "react";
import { IconButton } from "./Button";

/* ── EmptyState ──────────────────────────────────────────────────────────── */

/** Icon tile + what will appear here + the action that makes it appear. */
export function EmptyState({
  icon,
  title,
  text,
  action,
  tone = "neutral",
  className,
}: {
  icon: IconName;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "warning";
  className?: string;
}) {
  return (
    <div className={cn("grid place-items-center p-8", className)}>
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span
          className={cn(
            "grid h-14 w-14 place-items-center rounded-xl border border-line bg-surface",
            tone === "warning" ? "text-warning" : "text-accent-ink",
          )}
        >
          <Icon name={icon} size={24} />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold text-balance text-fg">{title}</h2>
          {text ? <p className="text-sm text-fg-3">{text}</p> : null}
        </div>
        {action ? <div className="flex flex-wrap justify-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}

/* ── DropZone ────────────────────────────────────────────────────────────── */

/** Drop a file here or click to pick one. */
export function DropZone({
  onFile,
  accept,
  title,
  hint,
  icon = "upload",
  busy,
  compact,
  className,
}: {
  onFile: (file: File) => void;
  accept?: string;
  title: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  busy?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={cn(
        "group flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors focus-ring",
        compact ? "p-4" : "p-10",
        over
          ? "border-accent-ink/70 bg-accent/8"
          : "border-line-strong bg-surface hover:border-fg-4 hover:bg-surface-2",
        busy && "opacity-60",
        className,
      )}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <span
        className={cn(
          "grid place-items-center rounded-lg transition-colors",
          compact ? "h-9 w-9" : "h-12 w-12",
          over ? "bg-accent/18 text-accent-ink" : "bg-field text-fg-2 group-hover:text-fg",
        )}
      >
        <Icon name={icon} size={compact ? 18 : 22} />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium text-fg">{title}</span>
        {hint ? <span className="text-xs text-fg-3">{hint}</span> : null}
      </span>
    </button>
  );
}

/* ── Veil ────────────────────────────────────────────────────────────────── */

/**
 * Blurs sensitive content until clicked (the owner's NSFW default). While veiled, the first
 * click only reveals; it never reaches what's underneath.
 */
export function Veil({
  active,
  children,
  label = "NSFW",
  compact,
  className,
}: {
  active: boolean;
  children: ReactNode;
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const veiled = active && !revealed;
  const reveal = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setRevealed(true);
  };
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <div
        className={cn(
          "h-full w-full transition-[filter,transform] duration-300",
          veiled && "scale-110 blur-xl saturate-50",
        )}
        aria-hidden={veiled || undefined}
      >
        {children}
      </div>
      {veiled ? (
        <button
          type="button"
          onClick={reveal}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") reveal(e);
          }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-black/25 text-white focus-ring"
          aria-label={`${label}: click to reveal`}
        >
          <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-2xs font-semibold tracking-wide uppercase">
            <Icon name="eye-off" size={12} />
            {label}
          </span>
          {compact ? null : <span className="text-2xs text-white/75">Click to reveal</span>}
        </button>
      ) : null}
    </div>
  );
}

/* ── ProgressBar ─────────────────────────────────────────────────────────── */

/** Determinate (0–1) or indeterminate (null) progress. */
export function ProgressBar({
  value,
  label,
  tone = "accent",
  size = "md",
  className,
}: {
  value: number | null;
  label: string;
  tone?: "accent" | "success" | "danger";
  size?: "sm" | "md";
  className?: string;
}) {
  const fill = tone === "success" ? "bg-green" : tone === "danger" ? "bg-red" : "bg-accent";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(value * 100)}
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-sunken",
        size === "sm" ? "h-1" : "h-1.5",
        className,
      )}
    >
      {value === null ? (
        <motion.div
          className={cn("absolute inset-y-0 w-1/3 rounded-full", fill)}
          initial={{ left: "-35%" }}
          animate={{ left: "100%" }}
          transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
      ) : (
        <motion.div
          className={cn("absolute inset-y-0 left-0 rounded-full", fill)}
          initial={false}
          animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
          transition={glide}
        />
      )}
    </div>
  );
}

/* ── CopyButton ──────────────────────────────────────────────────────────── */

export function CopyButton({
  text,
  label = "Copy",
  size = "xs",
  className,
}: {
  text: string;
  label?: string;
  size?: "xs" | "sm";
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      icon={done ? "check" : "copy"}
      label={done ? "Copied" : label}
      size={size}
      className={cn(done && "text-success hover:text-success", className)}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    />
  );
}

/* ── PropertyList ────────────────────────────────────────────────────────── */

export interface Property {
  label: string;
  value: ReactNode;
  /** Text to copy (shows a copy button on hover). */
  copy?: string;
  mono?: boolean;
}

/** Label/value rows for metadata. Empty values are skipped. */
export function PropertyList({
  items,
  labelWidth = 104,
  className,
}: {
  items: Property[];
  labelWidth?: number;
  className?: string;
}) {
  const shown = items.filter((p) => p.value !== null && p.value !== undefined && p.value !== "");
  return (
    <dl
      className={cn("grid gap-x-3 gap-y-1.5 text-sm", className)}
      style={{ gridTemplateColumns: `${labelWidth}px minmax(0,1fr)` }}
    >
      {shown.map((p) => (
        <div key={p.label} className="group contents">
          <dt className="pt-px text-fg-3">{p.label}</dt>
          <dd className="flex min-w-0 items-start gap-1">
            <span
              className={cn("min-w-0 break-words text-fg", p.mono && "font-mono text-xs leading-5")}
            >
              {p.value}
            </span>
            {p.copy ? (
              <CopyButton
                text={p.copy}
                label={`Copy ${p.label.toLowerCase()}`}
                className="-my-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              />
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ── TreeRow ─────────────────────────────────────────────────────────────── */

/** One row of a file tree: indent, disclosure chevron, icon, label, trailing actions. */
export function TreeRow({
  depth,
  label,
  icon,
  open,
  selected,
  dirty,
  meta,
  actions,
  onClick,
  onToggle,
  className,
}: {
  depth: number;
  label: ReactNode;
  icon: IconName;
  /** Folders pass open/closed; files leave it undefined. */
  open?: boolean;
  selected?: boolean;
  /** Unsaved changes marker. */
  dirty?: boolean;
  meta?: ReactNode;
  actions?: ReactNode;
  onClick: () => void;
  onToggle?: () => void;
  className?: string;
}) {
  const folder = open !== undefined;
  return (
    <div
      className={cn(
        "group relative flex h-7 items-center rounded-sm pr-1 text-sm transition-colors",
        selected ? "bg-accent/15 text-fg" : "text-fg-2 hover:bg-field hover:text-fg",
        className,
      )}
      style={{ paddingLeft: 4 + depth * 14 }}
    >
      <button
        type="button"
        onClick={folder ? (onToggle ?? onClick) : onClick}
        aria-expanded={folder ? open : undefined}
        aria-current={selected || undefined}
        className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch rounded-sm text-left focus-ring"
      >
        <span className="grid w-3.5 shrink-0 place-items-center text-fg-4">
          {folder ? (
            <Icon
              name="chevron-right"
              size={12}
              className={cn("transition-transform duration-150", open && "rotate-90")}
            />
          ) : null}
        </span>
        <Icon
          name={icon}
          size={14}
          className={cn("shrink-0", selected ? "text-accent-ink" : "text-fg-3")}
        />
        <span className="truncate">{label}</span>
        {dirty ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-ink" title="Unsaved changes">
            <span className="sr-only">Unsaved changes</span>
          </span>
        ) : null}
        {meta ? (
          <span className="ml-auto shrink-0 pl-2 font-mono text-2xs text-fg-4">{meta}</span>
        ) : null}
      </button>
      {actions ? (
        <span className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {actions}
        </span>
      ) : null}
    </div>
  );
}

/* ── InlineInput ─────────────────────────────────────────────────────────── */

/**
 * A borderless text input for dense lists (wildcard lines): it reads like text and shows a field
 * only on hover and focus. `muted` dims it (comments).
 */
export function InlineInput({
  muted,
  mono = true,
  className,
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  muted?: boolean;
  mono?: boolean;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={ref}
      spellCheck={false}
      className={cn(
        "h-7 min-w-0 rounded-sm border border-transparent bg-transparent px-2 outline-none transition-colors",
        "hover:border-line focus:border-accent-ink/60 focus:bg-field disabled:opacity-45",
        mono ? "font-mono text-[12.5px]" : "text-sm",
        muted ? "text-fg-4 italic" : "text-fg",
        className,
      )}
      {...rest}
    />
  );
}
