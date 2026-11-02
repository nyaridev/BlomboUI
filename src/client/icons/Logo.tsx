import { cn } from "@client/lib/cn";

/**
 * The Blombo mark, Nodey: a ComfyUI node with a face. The left socket is an open input; the
 * right one is the connected output, in generate orange (--mark-socket: white on the orange
 * accent). The tile follows the profile accent.
 * Same 32-grid shapes as favicon.svg; eyes and gaps are holes, so the tile shows through.
 */
const NODEY =
  "M7 12V11A3 3 0 0 1 10 8H22A3 3 0 0 1 25 11V12ZM7 13H25V14.25A3.25 3.25 0 0 0 25 20.75V21A3 3 0 0 1 22 24H10A3 3 0 0 1 7 21V20.75A3.25 3.25 0 0 0 7 14.25ZM12 16.25A1.25 1.25 0 0 1 14.5 16.25V18.75A1.25 1.25 0 0 1 12 18.75ZM17.5 16.25A1.25 1.25 0 0 1 20 16.25V18.75A1.25 1.25 0 0 1 17.5 18.75ZM4.5 17.5A2.5 2.5 0 1 0 9.5 17.5A2.5 2.5 0 1 0 4.5 17.5ZM6.1 17.5A0.9 0.9 0 1 0 7.9 17.5A0.9 0.9 0 1 0 6.1 17.5Z";

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path d={NODEY} fill="var(--on-accent)" fillRule="evenodd" />
      <circle cx="25" cy="17.5" r="2.5" fill="var(--mark-socket)" />
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
