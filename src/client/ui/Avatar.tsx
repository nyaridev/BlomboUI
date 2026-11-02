import { cn } from "@client/lib/cn";
import type { AccentId } from "@shared/constants";
import { useState } from "react";

/**
 * Profile avatar: uploaded image or a monogram on the profile's accent. As a circle, the ring
 * shows the accent so profiles are recognizable in the header. As a card, it fills its
 * container edge to edge (the profile screen's cards); `size` then only scales the monogram.
 */
export function Avatar({
  name,
  src,
  accent = "blue",
  size = 32,
  ring = true,
  shape = "circle",
  className,
}: {
  name: string;
  src?: string | null;
  accent?: AccentId;
  size?: number;
  ring?: boolean;
  shape?: "circle" | "card";
  className?: string;
}) {
  const circle = shape === "circle";
  // The picture that finished loading; it fades in over the plain card instead of popping in.
  const [loaded, setLoaded] = useState<string | null>(null);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center",
        circle ? "relative rounded-full" : "absolute inset-0",
        className,
      )}
      style={
        circle
          ? {
              width: size,
              height: size,
              boxShadow: ring
                ? `0 0 0 ${Math.max(1.5, size / 22)}px var(--bg), 0 0 0 ${Math.max(3, size / 11)}px var(--${accent})`
                : undefined,
            }
          : undefined
      }
    >
      {src ? (
        <img
          src={src}
          alt=""
          // Absolute, so a non-square picture is cropped to the box instead of sizing it.
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-200",
            circle && "rounded-full",
            !circle && loaded !== src && "opacity-0",
          )}
          draggable={false}
          onLoad={() => setLoaded(src)}
        />
      ) : (
        <span
          className={cn(
            "grid h-full w-full place-items-center font-semibold text-white",
            circle && "rounded-full",
          )}
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
