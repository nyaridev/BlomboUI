/**
 * Command palette: a search field over a grouped list of things to jump to or do. Fuzzy
 * matching (lib/fuzzy), arrow keys and Enter, Escape closes. With an empty query each group
 * shows its first few entries; typing ranks everything by how well it matches. The list never
 * renders more than MAX_SHOWN rows, so hundreds of models stay cheap.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { fuzzyFilter } from "@client/lib/fuzzy";
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
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Kbd } from "./feedback";

export interface PaletteItem {
  id: string;
  label: string;
  group: string;
  icon?: IconName;
  /** A small image instead of the icon (model thumbnails). */
  thumb?: string | null;
  /** Muted text after the label ("Settings page", a folder). */
  hint?: ReactNode;
  /** Shortcut keys to show on the right. */
  keys?: string[];
  /** Extra words that should find it. */
  keywords?: string;
}

const PER_GROUP_EMPTY = 6;
const MAX_SHOWN = 60;

export function CommandPalette({
  open,
  onOpenChange,
  items,
  onPick,
  placeholder = "Type a command or search…",
  emptyText = "Nothing matches. Try fewer letters.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
  onPick: (item: PaletteItem) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const { refs, context } = useFloating({ open, onOpenChange });
  const { getFloatingProps } = useInteractions([
    useDismiss(context, { outsidePressEvent: "mousedown" }),
    useRole(context, { role: "dialog" }),
  ]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const shown = useMemo(() => {
    if (!query.trim()) {
      const counts = new Map<string, number>();
      return items.filter((i) => {
        const n = counts.get(i.group) ?? 0;
        counts.set(i.group, n + 1);
        return n < PER_GROUP_EMPTY;
      });
    }
    return fuzzyFilter(items, query, (i) => `${i.label} ${i.keywords ?? ""} ${i.group}`).slice(
      0,
      MAX_SHOWN,
    );
  }, [items, query]);

  // Grouped for display, groups in order of their best entry.
  const groups = useMemo(() => {
    const order: string[] = [];
    const by = new Map<string, PaletteItem[]>();
    for (const item of shown) {
      if (!by.has(item.group)) {
        order.push(item.group);
        by.set(item.group, []);
      }
      by.get(item.group)?.push(item);
    }
    return order.map((g) => ({ group: g, items: by.get(g) ?? [] }));
  }, [shown]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (item: PaletteItem | undefined) => {
    if (!item) return;
    onOpenChange(false);
    onPick(item);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, flat.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(flat[active]);
    }
  };

  let index = -1;
  return (
    <FloatingPortal>
      <AnimatePresence>
        {open ? (
          <FloatingOverlay lockScroll className="z-[320] flex justify-center px-4 pt-[12vh]">
            <motion.div
              className="absolute inset-0 bg-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
            />
            <FloatingFocusManager context={context} initialFocus={0}>
              <motion.div
                ref={refs.setFloating}
                {...getFloatingProps()}
                aria-label="Command palette"
                initial={{ opacity: 0, scale: 0.97, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
                transition={{ type: "spring", stiffness: 560, damping: 40 }}
                className="relative flex h-fit max-h-[min(70vh,620px)] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-line-strong bg-surface-3 shadow-pop"
              >
                <div className="flex items-center gap-3 border-b border-line px-4">
                  <Icon name="search" size={17} className="shrink-0 text-fg-3" />
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder}
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={`${baseId}-list`}
                    aria-activedescendant={flat[active] ? `${baseId}-${active}` : undefined}
                    aria-autocomplete="list"
                    className="h-13 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-4"
                  />
                  <Kbd>Esc</Kbd>
                </div>
                <div
                  ref={listRef}
                  id={`${baseId}-list`}
                  role="listbox"
                  aria-label="Results"
                  className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-1.5"
                >
                  {flat.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-fg-3">{emptyText}</p>
                  ) : null}
                  {groups.map((g) => (
                    <div key={g.group} role="group" aria-label={g.group} className="pb-1">
                      <div className="label-caps px-2.5 pt-2 pb-1 text-[10px]">{g.group}</div>
                      {g.items.map((item) => {
                        index++;
                        const i = index;
                        const selected = i === active;
                        return (
                          <div
                            key={item.id}
                            id={`${baseId}-${i}`}
                            role="option"
                            tabIndex={-1}
                            aria-selected={selected}
                            data-index={i}
                            onMouseMove={() => setActive(i)}
                            onClick={() => pick(item)}
                            onKeyDown={() => undefined}
                            className={cn(
                              "flex h-10 cursor-pointer items-center gap-3 rounded-md px-2.5 text-sm",
                              selected ? "bg-field text-fg" : "text-fg-2",
                            )}
                          >
                            {item.thumb ? (
                              <img
                                src={item.thumb}
                                alt=""
                                loading="lazy"
                                className="h-7 w-7 shrink-0 rounded-sm object-cover"
                              />
                            ) : (
                              <span
                                className={cn(
                                  "grid h-7 w-7 shrink-0 place-items-center rounded-md",
                                  selected ? "bg-accent/15 text-accent-ink" : "bg-sunken text-fg-3",
                                )}
                              >
                                <Icon name={item.icon ?? "chevron-right"} size={15} />
                              </span>
                            )}
                            <span className="min-w-0 truncate">{item.label}</span>
                            {item.hint ? (
                              <span className="min-w-0 truncate text-xs text-fg-4">
                                {item.hint}
                              </span>
                            ) : null}
                            <span className="ml-auto flex shrink-0 items-center gap-1">
                              {item.keys?.map((k) => (
                                <Kbd key={k}>{k}</Kbd>
                              ))}
                              {selected ? (
                                <Icon name="arrow-right" size={14} className="text-fg-3" />
                              ) : null}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 border-t border-line bg-surface-2 px-4 py-2 text-2xs text-fg-3">
                  <span className="flex items-center gap-1.5">
                    <Kbd>↑</Kbd>
                    <Kbd>↓</Kbd> to move
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Kbd>Enter</Kbd> to open
                  </span>
                  <span className="ml-auto">{flat.length ? `${flat.length} shown` : ""}</span>
                </div>
              </motion.div>
            </FloatingFocusManager>
          </FloatingOverlay>
        ) : null}
      </AnimatePresence>
    </FloatingPortal>
  );
}
