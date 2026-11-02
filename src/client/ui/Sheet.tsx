/**
 * A side panel that slides in over the page. Narrow screens show sidebars this way (the gallery's
 * libraries, the wildcard tree): the same content, opened from a button instead of taking half
 * the screen. Focus trap and dismiss work like Dialog.
 */
import { cn } from "@client/lib/cn";
import { exitFast, glide } from "@client/lib/motion";
import {
  FloatingFocusManager,
  FloatingOverlay,
  FloatingPortal,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

export function Sheet({
  open,
  onOpenChange,
  label,
  side = "left",
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the panel holds, for screen readers. */
  label: string;
  side?: "left" | "right";
  children: ReactNode;
  className?: string;
}) {
  const { refs, context } = useFloating({ open, onOpenChange });
  const { getFloatingProps } = useInteractions([
    useDismiss(context, { outsidePressEvent: "mousedown" }),
    useRole(context, { role: "dialog" }),
  ]);
  const from = side === "left" ? "-100%" : "100%";
  return (
    <FloatingPortal>
      <AnimatePresence>
        {open ? (
          <FloatingOverlay lockScroll className="z-[300]">
            <motion.div
              className="absolute inset-0 bg-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
            />
            <FloatingFocusManager context={context}>
              <motion.div
                ref={refs.setFloating}
                {...getFloatingProps({ "aria-label": label })}
                initial={{ x: from }}
                animate={{ x: 0 }}
                exit={{ x: from, transition: exitFast }}
                transition={glide}
                className={cn(
                  "absolute inset-y-0 flex w-[min(85vw,320px)] flex-col overflow-hidden bg-surface shadow-pop",
                  side === "left" ? "left-0 border-r border-line" : "right-0 border-l border-line",
                  className,
                )}
              >
                {children}
              </motion.div>
            </FloatingFocusManager>
          </FloatingOverlay>
        ) : null}
      </AnimatePresence>
    </FloatingPortal>
  );
}
