import { cn } from "@client/lib/cn";
import { glide } from "@client/lib/motion";
import { motion } from "motion/react";
import type { ReactNode } from "react";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "generate";

const toneText: Record<Tone, string> = {
  neutral: "text-fg-2",
  accent: "text-accent-ink",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  generate: "text-generate-ink",
};

const toneBadge: Record<Tone, string> = {
  neutral: "bg-field text-fg-2 border-line",
  accent: "bg-accent/15 text-accent-ink border-accent/30",
  success: "bg-green/15 text-green-ink border-green/30",
  warning: "bg-yellow/15 text-yellow-ink border-yellow/30",
  danger: "bg-red/15 text-red-ink border-red/30",
  generate: "bg-generate/15 text-generate-ink border-generate/30",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  solid,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  solid?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-xs border px-1.5 text-2xs font-medium tabular",
        solid ? "border-transparent bg-red text-white" : toneBadge[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Count bubble that sits on the corner of an icon button. */
export function CountBubble({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[10px] font-semibold leading-none text-white tabular ring-2 ring-surface">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-line-strong border-b-2 bg-field px-1 font-mono text-[10.5px] font-medium text-fg-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function StatusDot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  const color = {
    neutral: "bg-fg-4",
    accent: "bg-accent-ink",
    success: "bg-green-ink",
    warning: "bg-yellow-ink",
    danger: "bg-red-ink",
    generate: "bg-generate-hi",
  }[tone];
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse ? (
        <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", color)} />
      ) : null}
      <span className={cn("relative h-2 w-2 rounded-full", color)} />
    </span>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("animate-spin", className)}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "block animate-pulse rounded-md bg-[linear-gradient(90deg,var(--field),var(--field-hover),var(--field))] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}

/** A labelled horizontal meter (VRAM, disk). Tone shifts as it fills. */
export function Meter({
  value,
  max,
  label,
  valueText,
  className,
  width = 112,
}: {
  value: number;
  max: number;
  label: string;
  valueText: string;
  className?: string;
  width?: number;
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const fill = pct > 0.9 ? "bg-red" : pct > 0.75 ? "bg-yellow" : "bg-accent";
  return (
    <div
      className={cn(
        "relative flex h-8 items-center gap-2 overflow-hidden rounded-md border border-line bg-sunken pr-2.5 pl-2",
        className,
      )}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
    >
      <span className="label-caps relative z-10 text-[10px]">{label}</span>
      <div className="relative z-10 h-1.5 overflow-hidden rounded-full bg-field" style={{ width }}>
        <motion.div
          className={cn("absolute inset-y-0 left-0 rounded-full", fill)}
          initial={false}
          animate={{ width: `${pct * 100}%` }}
          transition={glide}
        />
      </div>
      <span className="relative z-10 font-mono text-xs text-fg tabular">{valueText}</span>
    </div>
  );
}

export interface StageSegment {
  id: string;
  label: string;
  /** 0..1 */
  progress: number;
  state: "pending" | "active" | "done";
}

/** Generation progress split by stage (base ▸ hires ▸ adetailer …). */
export function StageProgress({
  segments,
  className,
}: {
  segments: StageSegment[];
  className?: string;
}) {
  return (
    <div className={cn("flex w-full gap-1", className)}>
      {segments.map((s) => (
        <div key={s.id} className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-field">
            <motion.div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                s.state === "done" ? "bg-fg-3" : "bg-generate-hi",
              )}
              initial={false}
              animate={{ width: `${(s.state === "done" ? 1 : s.progress) * 100}%` }}
              transition={glide}
            />
          </div>
          <span
            className={cn(
              "truncate text-2xs",
              s.state === "active"
                ? "text-generate-ink"
                : s.state === "done"
                  ? "text-fg-3"
                  : "text-fg-4",
            )}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ToneText({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={toneText[tone]}>{children}</span>;
}

/** A small circular progress (0–1) in the current text color, for header chips. */
export function ProgressRing({ value, size = 20 }: { value: number; size?: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className="-rotate-90" aria-hidden="true">
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity=".2"
        strokeWidth="2.5"
      />
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        style={{ transition: "stroke-dashoffset .4s ease-out" }}
      />
    </svg>
  );
}
