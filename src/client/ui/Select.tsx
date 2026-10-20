/** Select: a custom listbox (Floating UI behavior, our visuals). Groups, icons, hints, typeahead. */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import {
  autoUpdate,
  FloatingFocusManager,
  FloatingPortal,
  flip,
  offset,
  size as sizeMw,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
} from "@floating-ui/react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useRef, useState } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  hint?: ReactNode;
  group?: string;
  disabled?: boolean;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  size = "md",
  label,
  className,
  disabled,
}: {
  value: T | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const labelsRef = useRef<Array<string | null>>([]);
  labelsRef.current = options.map((o) => o.label);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      sizeMw({
        padding: 8,
        apply({ rects, availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            minWidth: `${rects.reference.width}px`,
            maxHeight: `${Math.min(340, availableHeight)}px`,
          });
        },
      }),
    ],
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: "listbox" }),
    useListNavigation(context, {
      listRef,
      activeIndex,
      selectedIndex,
      onNavigate: setActiveIndex,
      loop: true,
    }),
    useTypeahead(context, {
      listRef: labelsRef,
      activeIndex,
      selectedIndex,
      onMatch: open
        ? setActiveIndex
        : (i) => {
            const o = options[i];
            if (o && !o.disabled) onChange(o.value);
          },
    }),
  ]);

  const current = options.find((o) => o.value === value);
  const h =
    size === "sm" ? "h-7 px-2 text-xs" : size === "lg" ? "h-10 px-3 text-sm" : "h-8 px-2.5 text-sm";

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={label}
        disabled={disabled}
        data-open={open || undefined}
        className={cn(
          "inline-flex min-w-0 items-center gap-2 rounded-md border border-line bg-field text-left text-fg transition-colors focus-ring",
          "hover:border-line-strong data-[open]:border-accent-ink/70 data-[open]:ring-2 data-[open]:ring-accent/25 disabled:opacity-45",
          h,
          className,
        )}
        {...getReferenceProps()}
      >
        {current?.icon ? <Icon name={current.icon} size={15} className="text-fg-3" /> : null}
        <span className={cn("min-w-0 flex-1 truncate", !current && "text-fg-4")}>
          {current?.label ?? placeholder}
        </span>
        <Icon name="chevrons-up-down" size={14} className="text-fg-3" />
      </button>
      <FloatingPortal>
        <AnimatePresence>
          {open ? (
            <FloatingFocusManager context={context} modal={false}>
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                className="z-[360] flex"
                {...getFloatingProps()}
              >
                <motion.div
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.08 } }}
                  transition={{ duration: 0.12 }}
                  className="scroll-quiet w-full overflow-auto rounded-lg border border-line-strong bg-surface-3 p-1 shadow-pop"
                >
                  {options.map((o, i) => {
                    const prevGroup = options[i - 1]?.group;
                    const selected = o.value === value;
                    const active = activeIndex === i;
                    return (
                      <div key={o.value}>
                        {o.group && o.group !== prevGroup ? (
                          <div
                            className={cn(
                              "label-caps px-2 pb-1 text-[10px]",
                              i > 0 ? "pt-2.5" : "pt-1",
                            )}
                          >
                            {o.group}
                          </div>
                        ) : null}
                        <div
                          ref={(n) => {
                            listRef.current[i] = n;
                          }}
                          role="option"
                          aria-selected={selected}
                          aria-disabled={o.disabled}
                          tabIndex={active ? 0 : -1}
                          className={cn(
                            "flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm outline-none",
                            active ? "bg-field text-fg" : "text-fg-2",
                            o.disabled && "pointer-events-none opacity-40",
                          )}
                          {...getItemProps({
                            onClick() {
                              onChange(o.value);
                              setOpen(false);
                            },
                            onKeyDown(e) {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onChange(o.value);
                                setOpen(false);
                              }
                            },
                          })}
                        >
                          {o.icon ? <Icon name={o.icon} size={15} className="text-fg-3" /> : null}
                          <span className={cn("flex-1 truncate", selected && "text-fg")}>
                            {o.label}
                          </span>
                          {o.hint ? <span className="text-xs text-fg-3">{o.hint}</span> : null}
                          <Icon
                            name="check"
                            size={14}
                            strokeWidth={2.25}
                            className={cn(
                              "text-accent-ink",
                              selected ? "opacity-100" : "opacity-0",
                            )}
                          />
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              </div>
            </FloatingFocusManager>
          ) : null}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}
