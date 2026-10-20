/**
 * Star rating, 0–5. Click a star to set it, click the same star again to clear; arrow keys move
 * one star, 0–5 set it, Delete clears. A radio group for screen readers. `readOnly` shows stars
 * only (gallery tiles).
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useState } from "react";

export function StarRating({
  value,
  onChange,
  size = "md",
  readOnly,
  label = "Rating",
  className,
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: "sm" | "md";
  readOnly?: boolean;
  label?: string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const px = size === "sm" ? 12 : 17;
  const shown = hover ?? value;
  const set = (n: number) => onChange?.(Math.max(0, Math.min(5, n)));
  if (readOnly)
    return (
      <span
        className={cn("inline-flex items-center gap-0.5", className)}
        role="img"
        aria-label={`${value} of 5 stars`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <Icon
            key={n}
            name="star"
            size={px}
            className={n <= value ? "fill-current text-yellow-ink" : "text-fg-4"}
          />
        ))}
      </span>
    );
  return (
    <div
      role="radiogroup"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") set(value + 1);
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") set(value - 1);
        else if (/^[0-5]$/.test(e.key)) set(Number(e.key));
        else if (e.key === "Delete" || e.key === "Backspace") set(0);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseLeave={() => setHover(null)}
      className={cn("inline-flex items-center gap-0.5 rounded-md p-0.5 focus-ring", className)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          tabIndex={-1}
          onMouseEnter={() => setHover(n)}
          onClick={() => set(value === n ? 0 : n)}
          className="rounded-xs p-0.5 transition-transform hover:scale-110"
        >
          <Icon
            name="star"
            size={px}
            className={cn(
              "transition-colors",
              n <= shown ? "fill-current text-yellow-ink" : "text-fg-4",
              hover !== null && n <= shown && "opacity-80",
            )}
          />
        </button>
      ))}
    </div>
  );
}
