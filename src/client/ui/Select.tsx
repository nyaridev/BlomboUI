/**
 * Select: a dropdown you can type in (a combobox; Floating UI behavior, our visuals). Groups,
 * icons, hints. Closed, the field shows the picked option; a click opens the list and clears the
 * field (the pick stays as its placeholder); typing narrows the list to the labels that contain
 * every word of the text and marks the first match, so Enter picks it at once. ↑ ↓ move, Esc closes. The list
 * reserves no scrollbar space when it doesn't scroll. `MultiSelect` is the same list picking
 * several: it stays open, picked rows are green with a check, the field reads "SDXL 1.0,
 * Illustrious", and an optional first row clears them all.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import {
  autoUpdate,
  FloatingFocusManager,
  FloatingPortal,
  flip,
  offset,
  size as sizeMw,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useId, useRef, useState } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  hint?: ReactNode;
  group?: string;
  disabled?: boolean;
}

interface ListboxProps<T extends string> {
  options: SelectOption<T>[];
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function Select<T extends string>({
  value,
  onChange,
  ...rest
}: ListboxProps<T> & { value: T | null; onChange: (value: T) => void }) {
  return (
    <Listbox
      {...rest}
      isPicked={(v) => v === value}
      onPick={(v) => {
        onChange(v);
        return true;
      }}
      shown={rest.options.find((o) => o.value === value)}
    />
  );
}

export function MultiSelect<T extends string>({
  value,
  onChange,
  clearLabel,
  ...rest
}: ListboxProps<T> & {
  value: T[];
  onChange: (value: T[]) => void;
  /** A first row that clears the picks ("All base models"), checked while none is picked. */
  clearLabel?: string;
}) {
  const CLEAR = "\u0000clear" as T;
  const options: SelectOption<T>[] = clearLabel
    ? [{ value: CLEAR, label: clearLabel }, ...rest.options]
    : rest.options;
  const picked = rest.options.filter((o) => value.includes(o.value));
  return (
    <Listbox
      {...rest}
      options={options}
      multi
      isPicked={(v) => (v === CLEAR ? value.length === 0 : value.includes(v))}
      onPick={(v) => {
        if (v === CLEAR) onChange([]);
        else onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
        return false;
      }}
      shown={
        picked.length
          ? { value: CLEAR, label: picked.map((o) => o.label).join(", ") }
          : clearLabel
            ? { value: CLEAR, label: clearLabel }
            : undefined
      }
    />
  );
}

/**
 * The options whose label contains every word of the text, case-insensitively ("wan 2.2" finds
 * "Wan Video 2.2 T2V-A14B"); all of them without text.
 */
export function matchOptions<T extends string>(
  options: SelectOption<T>[],
  text: string,
): SelectOption<T>[] {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  return options.filter((o) => {
    const label = o.label.toLowerCase();
    return words.every((w) => label.includes(w));
  });
}

function Listbox<T extends string>({
  options,
  placeholder = "Select…",
  size = "md",
  label,
  className,
  disabled,
  multi = false,
  isPicked,
  onPick,
  shown,
}: ListboxProps<T> & {
  multi?: boolean;
  isPicked: (value: T) => boolean;
  /** Returns whether the list closes. */
  onPick: (value: T) => boolean;
  /** What the field shows while closed. */
  shown: SelectOption<T> | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const visible = matchOptions(options, text);
  const firstEnabled = () => {
    const i = visible.findIndex((o) => !o.disabled);
    return i < 0 ? null : i;
  };

  const openList = () => {
    if (open || disabled) return;
    setText("");
    // Start on the picked option, so it's marked and scrolled into view.
    const at = options.findIndex((o) => isPicked(o.value) && !o.disabled);
    setActiveIndex(at < 0 ? firstEnabled() : at);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setText("");
    setActiveIndex(null);
  };

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (o) => (o ? openList() : close()),
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      sizeMw({
        padding: 8,
        apply({ rects, availableHeight, availableWidth, elements }) {
          Object.assign(elements.floating.style, {
            minWidth: `${rects.reference.width}px`,
            maxHeight: `${Math.min(340, availableHeight)}px`,
            maxWidth: `${availableWidth}px`,
          });
        },
      }),
    ],
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useDismiss(context),
    useRole(context, { role: "listbox" }),
    useListNavigation(context, {
      listRef,
      activeIndex,
      onNavigate: setActiveIndex,
      virtual: true,
      loop: true,
    }),
  ]);

  const pick = (o: SelectOption<T> | undefined) => {
    if (!o || o.disabled) return;
    if (onPick(o.value)) close();
  };
  const h =
    size === "sm" ? "h-7 px-2 text-xs" : size === "lg" ? "h-10 px-3 text-sm" : "h-8 px-2.5 text-sm";

  return (
    <>
      <div
        ref={refs.setReference}
        data-open={open || undefined}
        title={multi && !open ? shown?.label : undefined}
        // A click anywhere on the field (the icon, the chevron) opens it and puts the caret in.
        onMouseDown={(e) => {
          if (disabled) return;
          if (e.target !== input.current) e.preventDefault();
          input.current?.focus();
          if (open && e.target !== input.current) close();
          else openList();
        }}
        className={cn(
          "inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-md border border-line bg-field text-left text-fg transition-colors",
          "hover:border-line-strong focus-within:border-accent-ink/70 data-[open]:border-accent-ink/70 data-[open]:ring-2 data-[open]:ring-accent/25",
          disabled && "pointer-events-none opacity-45",
          h,
          className,
        )}
      >
        {shown?.icon && !open ? (
          <Icon name={shown.icon} size={15} className="shrink-0 text-fg-3" />
        ) : null}
        {open ? <Icon name="search" size={14} className="shrink-0 text-fg-3" /> : null}
        <input
          ref={input}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-autocomplete="list"
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          value={open ? text : (shown?.label ?? "")}
          placeholder={open ? (shown?.label ?? placeholder) : placeholder}
          className={cn(
            "min-w-0 flex-1 cursor-[inherit] truncate bg-transparent outline-none placeholder:text-fg-4",
            open && "cursor-text",
          )}
          {...getReferenceProps({
            onChange(e) {
              const next = (e.target as HTMLInputElement).value;
              setText(next);
              if (!open) setOpen(true);
              // The first match is marked, so Enter picks it.
              const i = matchOptions(options, next).findIndex((o) => !o.disabled);
              setActiveIndex(i < 0 ? null : i);
            },
            onKeyDown(e) {
              if (!open) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
                  e.preventDefault();
                  openList();
                }
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                pick(activeIndex === null ? undefined : visible[activeIndex]);
              } else if (e.key === "Tab") close();
            },
          })}
        />
        <Icon
          name="chevron-down"
          size={14}
          className={cn("shrink-0 text-fg-3 transition-transform", open && "rotate-180")}
        />
      </div>
      <FloatingPortal>
        <AnimatePresence>
          {open ? (
            <FloatingFocusManager
              context={context}
              modal={false}
              initialFocus={-1}
              returnFocus={false}
            >
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                className="z-[360] flex"
                {...getFloatingProps()}
              >
                <motion.div
                  aria-multiselectable={multi || undefined}
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.07 } }}
                  transition={{ duration: 0.08 }}
                  // No reserved gutter: a short list doesn't scroll, so it gets no empty strip.
                  className="scroll-quiet w-full overflow-auto rounded-lg border border-line-strong bg-surface-3 p-1 shadow-pop [scrollbar-gutter:auto]"
                >
                  {visible.length === 0 ? (
                    <div className="px-2 py-2 text-sm text-fg-3">Nothing matches "{text}".</div>
                  ) : null}
                  {visible.map((o, i) => {
                    const prevGroup = visible[i - 1]?.group;
                    const selected = isPicked(o.value);
                    // Several picks: picked rows are green (the clearing first row isn't).
                    const green = multi && selected && options.indexOf(o) > 0;
                    const active = activeIndex === i;
                    return (
                      <div key={o.value}>
                        {o.group && o.group !== prevGroup ? (
                          // Group titles: accent small caps under a line, rows indented below.
                          <div
                            className={cn(
                              "px-2 pb-1 text-[10px] font-semibold tracking-[0.08em] text-accent-ink uppercase",
                              i > 0 ? "mt-1.5 border-t border-line pt-2" : "pt-1",
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
                          tabIndex={-1}
                          id={`${listId}-${i}`}
                          aria-selected={active}
                          aria-checked={selected}
                          aria-disabled={o.disabled}
                          className={cn(
                            "flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm outline-none",
                            o.group && "pl-4",
                            green
                              ? active
                                ? "bg-green/25 text-fg"
                                : "bg-green/15 text-fg"
                              : active
                                ? "bg-fg/8 text-fg"
                                : "text-fg-2",
                            green && "mb-px",
                            o.disabled && "pointer-events-none opacity-40",
                          )}
                          {...getItemProps({
                            // Keep the caret in the field.
                            onMouseDown(e) {
                              e.preventDefault();
                            },
                            onClick() {
                              pick(o);
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
                              green ? "text-green-ink" : "text-accent-ink",
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
