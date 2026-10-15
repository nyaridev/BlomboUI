/** Modal dialog: Floating UI focus trap + scroll lock, our surface and motion. */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
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

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 520,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}) {
  const { refs, context } = useFloating({ open, onOpenChange });
  const { getFloatingProps } = useInteractions([
    useDismiss(context, { outsidePressEvent: "mousedown" }),
    useRole(context, { role: "dialog" }),
  ]);
  return (
    <FloatingPortal>
      <AnimatePresence>
        {open ? (
          <FloatingOverlay lockScroll className="z-[300] grid place-items-center p-4">
            <motion.div
              className="absolute inset-0 bg-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            />
            <FloatingFocusManager context={context}>
              <motion.div
                ref={refs.setFloating}
                {...getFloatingProps()}
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.12 } }}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                className={cn(
                  "relative flex max-h-[min(88vh,900px)] w-full flex-col overflow-hidden rounded-xl border border-line-strong bg-surface-2 shadow-pop",
                  className,
                )}
                style={{ maxWidth: width }}
              >
                {title ? (
                  <div className="flex items-start gap-3 border-b border-line px-5 pt-4 pb-3.5">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <h2 className="text-base font-semibold text-fg">{title}</h2>
                      {description ? <p className="text-sm text-fg-3">{description}</p> : null}
                    </div>
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={() => onOpenChange(false)}
                      className="-mr-1.5 grid h-8 w-8 place-items-center rounded-md text-fg-3 hover:bg-field hover:text-fg focus-ring"
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                ) : null}
                <div className="scroll-quiet min-h-0 flex-1 overflow-auto px-5 py-4">
                  {children}
                </div>
                {footer ? (
                  <div className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
                    {footer}
                  </div>
                ) : null}
              </motion.div>
            </FloatingFocusManager>
          </FloatingOverlay>
        ) : null}
      </AnimatePresence>
    </FloatingPortal>
  );
}
