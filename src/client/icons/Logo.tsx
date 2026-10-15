import { cn } from "@client/lib/cn";

/**
 * The Blombo mark: a lowercase "b" (stem + bowl) on an accent tile, with the generate-orange
 * spark. The tile follows the profile accent; the spark stays orange everywhere.
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="blombo-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-ink)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#blombo-tile)" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="8.5"
        fill="none"
        stroke="rgb(255 255 255 / .18)"
      />
      <path d="M11 7.5v16" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <circle cx="16.4" cy="18.6" r="5.2" stroke="#fff" strokeWidth="3.2" fill="none" />
      <circle cx="23.6" cy="8.6" r="2.6" fill="var(--generate-hi)" />
    </svg>
  );
}

/** Wordmark beside the mark, for the profile screen and About. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Logo size={30} />
      <span className="font-semibold text-lg tracking-tight text-fg">
        Blombo<span className="text-fg-3">UI</span>
      </span>
    </span>
  );
}
