import { cn } from "@client/lib/cn";
import type { AccentId } from "@shared/constants";

/**
 * Profile avatar: uploaded image or a monogram on the profile's accent. The ring shows the
 * accent so profiles are recognizable at a glance in the header and on the profile screen.
 */
export function Avatar({
  name,
  src,
  accent = "blue",
  size = 32,
  ring = true,
  className,
}: {
  name: string;
  src?: string | null;
  accent?: AccentId;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        boxShadow: ring
          ? `0 0 0 ${Math.max(1.5, size / 22)}px var(--bg), 0 0 0 ${Math.max(3, size / 11)}px var(--${accent})`
          : undefined,
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full rounded-full object-cover"
          draggable={false}
        />
      ) : (
        <span
          className="grid h-full w-full place-items-center rounded-full font-semibold text-white"
          style={{
            background: `radial-gradient(120% 120% at 25% 15%, var(--${accent}-ink), var(--${accent}) 55%, color-mix(in oklab, var(--${accent}) 55%, black))`,
            fontSize: size * 0.38,
            letterSpacing: "-0.02em",
          }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}
