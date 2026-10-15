/** Toasts: a tiny store + a stack in the bottom-right. `toast("Saved")` from anywhere. */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { bouncy } from "@client/lib/motion";
import { AnimatePresence, motion } from "motion/react";
import { create } from "zustand";

type ToastTone = "info" | "success" | "warning" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; run: () => void };
}

interface ToastStore {
  items: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;
const useToasts = create<ToastStore>((set, get) => ({
  items: [],
  push: (t) => {
    const id = nextId++;
    set({ items: [...get().items, { ...t, id }].slice(-4) });
    setTimeout(() => get().dismiss(id), t.tone === "error" ? 7000 : 3800);
  },
  dismiss: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
}));

export function toast(message: string, tone: ToastTone = "info", action?: ToastItem["action"]) {
  useToasts.getState().push({ message, tone, action });
}

const toneIcon: Record<ToastTone, [IconName, string]> = {
  info: ["info", "text-info"],
  success: ["check-circle", "text-success"],
  warning: ["errors", "text-warning"],
  error: ["x-circle", "text-danger"],
};

export function Toaster() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-[400] flex w-[340px] flex-col items-end gap-2"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const [icon, color] = toneIcon[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
              transition={bouncy}
              className="pointer-events-auto flex w-full items-center gap-2.5 rounded-lg border border-line-strong bg-surface-3 py-2.5 pr-2 pl-3 shadow-pop"
            >
              <Icon name={icon} size={17} className={color} />
              <span className="flex-1 text-sm text-fg">{t.message}</span>
              {t.action ? (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.run();
                    dismiss(t.id);
                  }}
                  className="rounded-sm px-2 py-1 text-sm font-medium text-accent-ink hover:bg-field"
                >
                  {t.action.label}
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-sm text-fg-3 hover:bg-field hover:text-fg",
                )}
              >
                <Icon name="x" size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
