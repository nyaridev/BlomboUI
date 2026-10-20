/**
 * A guided tour: one card at a time next to a highlighted part of the page. Steps point at
 * elements by CSS selector (`[data-tour=prompt]`); a `display: contents` wrapper is measured by
 * its children. The rest of the page is dimmed but stays visible. Arrow keys and Enter move,
 * Escape skips. Positions follow resizes and scrolling.
 */
import { cn } from "@client/lib/cn";
import { useModalFocus } from "@client/lib/hooks";
import { FloatingPortal } from "@floating-ui/react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "./Button";

export interface TourStep {
  target: string;
  title: string;
  text: ReactNode;
  /** Where the card goes relative to the target. */
  placement?: "bottom" | "top" | "right" | "left";
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function measure(selector: string): Box | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  let r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0 && el.children.length) {
    const rects = Array.from(el.children).map((c) => c.getBoundingClientRect());
    const x = Math.min(...rects.map((c) => c.left));
    const y = Math.min(...rects.map((c) => c.top));
    const right = Math.max(...rects.map((c) => c.right));
    const bottom = Math.max(...rects.map((c) => c.bottom));
    r = new DOMRect(x, y, right - x, bottom - y);
  }
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

const CARD_W = 320;
const PAD = 6;
const GAP = 12;

function cardPosition(box: Box | null, placement: TourStep["placement"], cardH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!box) return { left: vw / 2 - CARD_W / 2, top: vh / 2 - cardH / 2 };
  let left = box.x;
  let top = box.y + box.h + PAD + GAP;
  if (placement === "top") top = box.y - PAD - GAP - cardH;
  if (placement === "right") {
    left = box.x + box.w + PAD + GAP;
    top = box.y;
  }
  if (placement === "left") {
    left = box.x - PAD - GAP - CARD_W;
    top = box.y;
  }
  // A card that doesn't fit below goes above, and everything stays on screen.
  if (top + cardH > vh - 8 && placement !== "top") top = box.y - PAD - GAP - cardH;
  return {
    left: Math.min(Math.max(8, left), vw - CARD_W - 8),
    top: Math.min(Math.max(8, top), vh - cardH - 8),
  };
}

export function Tour({
  steps,
  open,
  onClose,
}: {
  steps: TourStep[];
  open: boolean;
  /** `finished` is true after the last step, false when skipped. */
  onClose: (finished: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(170);
  const cardRef = useRef<HTMLDivElement | null>(null);
  useModalFocus(cardRef, open && Boolean(steps.length));
  const step = steps[index];

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const update = useCallback(() => {
    if (step) setBox(measure(step.target));
  }, [step]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    document.querySelector(step.target)?.scrollIntoView({ block: "nearest" });
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    // The highlighted part can change size as it loads (thumbnails, a layout).
    const ro = new ResizeObserver(update);
    const el = document.querySelector(step.target);
    if (el) {
      ro.observe(el);
      for (const child of Array.from(el.children)) ro.observe(child);
    }
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      ro.disconnect();
    };
  }, [open, step, update]);

  const next = useCallback(() => {
    if (index >= steps.length - 1) onClose(true);
    else setIndex((i) => i + 1);
  }, [index, steps.length, onClose]);
  const back = () => setIndex((i) => Math.max(0, i - 1));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
      // Enter on a focused button (Skip, Back) is that button's; elsewhere it goes on.
      else if (
        e.key === "ArrowRight" ||
        (e.key === "Enter" && !(e.target instanceof HTMLButtonElement))
      )
        next();
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, next, onClose]);

  const pos = cardPosition(box, step?.placement, cardH);
  return (
    <FloatingPortal>
      <AnimatePresence>
        {open && step ? (
          <motion.div
            className="fixed inset-0 z-[310]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {/* The dim layer is one big shadow around the highlighted box. */}
            <motion.div
              aria-hidden
              className="absolute rounded-lg outline-2 outline-accent"
              animate={
                box
                  ? {
                      left: box.x - PAD,
                      top: box.y - PAD,
                      width: box.w + PAD * 2,
                      height: box.h + PAD * 2,
                    }
                  : { left: "50%", top: "50%", width: 0, height: 0 }
              }
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              style={{ boxShadow: "0 0 0 9999px var(--overlay)" }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Tour: ${step.title}`}
              ref={(el) => {
                cardRef.current = el;
                if (el && Math.abs(el.offsetHeight - cardH) > 2) setCardH(el.offsetHeight);
              }}
              tabIndex={-1}
              className="absolute flex flex-col gap-3 rounded-xl border border-line-strong bg-surface-3 p-4 shadow-pop"
              style={{ width: CARD_W }}
              animate={{ left: pos.left, top: pos.top }}
              transition={{ type: "spring", stiffness: 420, damping: 38 }}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xs text-fg-4 tabular">
                  {index + 1} / {steps.length}
                </span>
                <div className="ml-auto flex gap-1">
                  {steps.map((s, i) => (
                    <span
                      key={s.target + s.title}
                      className={cn(
                        "h-1.5 rounded-full transition-all",
                        i === index ? "w-4 bg-accent" : "w-1.5 bg-line-strong",
                      )}
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-fg">{step.title}</h2>
                <div className="text-sm text-fg-2">{step.text}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => onClose(false)}>
                  Skip the tour
                </Button>
                <div className="ml-auto flex gap-1.5">
                  {index > 0 ? (
                    <Button size="sm" variant="secondary" onClick={back}>
                      Back
                    </Button>
                  ) : null}
                  <Button size="sm" variant="primary" onClick={next} autoFocus>
                    {index === steps.length - 1 ? "Done" : "Next"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </FloatingPortal>
  );
}
