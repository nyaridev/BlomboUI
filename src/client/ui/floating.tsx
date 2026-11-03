/**
 * Everything that floats: Tooltip, Popover, Menu and the right-click menu (ContextMenuHost,
 * opened with `openContextMenu`). Behavior (positioning, dismissal, focus,
 * keyboard navigation, typeahead) comes from Floating UI; every pixel of the look is ours.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { exitFast, snappy } from "@client/lib/motion";
import {
  autoUpdate,
  FloatingFocusManager,
  FloatingPortal,
  flip,
  offset,
  type Placement,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useListNavigation,
  useMergeRefs,
  useRole,
  useTypeahead,
} from "@floating-ui/react";
import { AnimatePresence, motion } from "motion/react";
import {
  Children,
  cloneElement,
  type MouseEvent,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { create } from "zustand";
import { Kbd } from "./feedback";

type AnyElement = ReactElement<Record<string, unknown> & { ref?: Ref<HTMLElement> }>;

// Never wider than the screen (phones), whatever width the caller asked for.
const panel =
  "max-w-[calc(100vw-16px)] rounded-lg border border-line-strong bg-surface-3 text-fg shadow-pop outline-none";

/* ── Tooltip ─────────────────────────────────────────────────────────────── */

export function Tooltip({
  content,
  children,
  placement = "bottom",
  delay = 380,
}: {
  content: ReactNode;
  children: ReactElement;
  placement?: Placement;
  delay?: number;
}) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { move: false, delay: { open: delay, close: 0 } }),
    useFocus(context),
    useDismiss(context),
    useRole(context, { role: "tooltip" }),
  ]);
  const child = Children.only(children) as AnyElement;
  const ref = useMergeRefs([refs.setReference, child.props.ref]);
  return (
    <>
      {cloneElement(child, getReferenceProps({ ...child.props, ref }))}
      <FloatingPortal>
        <AnimatePresence>
          {open ? (
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="z-[370]"
              {...getFloatingProps()}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFast }}
                transition={{ duration: 0.08 }}
                className="pointer-events-none rounded-sm border border-line-strong bg-surface-3 px-2 py-1 text-xs font-medium whitespace-nowrap text-fg shadow-pop"
              >
                {content}
              </motion.div>
            </div>
          ) : null}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}

/* ── Popover ─────────────────────────────────────────────────────────────── */

export function Popover({
  trigger,
  children,
  placement = "bottom-start",
  open: controlledOpen,
  onOpenChange,
  className,
  modal = false,
}: {
  trigger: ReactElement;
  children: ReactNode | ((close: () => void) => ReactNode);
  placement?: Placement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  modal?: boolean;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (next: boolean) => {
    setInnerOpen(next);
    onOpenChange?.(next);
  };
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: "dialog" }),
  ]);
  const child = Children.only(trigger) as AnyElement;
  const ref = useMergeRefs([refs.setReference, child.props.ref]);
  const close = () => setOpen(false);
  return (
    <>
      {cloneElement(child, {
        ...getReferenceProps({ ...child.props, ref }),
        "data-open": open || undefined,
      })}
      <FloatingPortal>
        <AnimatePresence>
          {open ? (
            <FloatingFocusManager context={context} modal={modal} initialFocus={-1}>
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                className="z-[350]"
                {...getFloatingProps()}
              >
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, transition: exitFast }}
                  transition={snappy}
                  className={cn(panel, className)}
                  style={{ transformOrigin: "top" }}
                >
                  {typeof children === "function" ? children(close) : children}
                </motion.div>
              </div>
            </FloatingFocusManager>
          ) : null}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}

/* ── Menu ────────────────────────────────────────────────────────────────── */

export type MenuEntry =
  | {
      type?: "item";
      id: string;
      label: string;
      icon?: IconName;
      shortcut?: string;
      hint?: ReactNode;
      tone?: "default" | "danger";
      disabled?: boolean;
      onSelect: () => void;
    }
  | { type: "separator"; id: string }
  | { type: "label"; id: string; label: string };

export function Menu({
  trigger,
  items,
  header,
  placement = "bottom-end",
  width = 240,
}: {
  trigger: ReactElement;
  items: MenuEntry[];
  header?: ReactNode;
  placement?: Placement;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const actionable = items.filter((i) => i.type === undefined || i.type === "item");
  const labelsRef = useRef<Array<string | null>>(
    actionable.map((i) => ("label" in i ? i.label : null)),
  );
  labelsRef.current = actionable.map((i) => ("label" in i ? i.label : null));

  const {
    refs,
    floatingStyles,
    context,
    placement: side,
  } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  // Grow out of the trigger: from the side it's attached to, after flip() picked one.
  const above = side.startsWith("top");
  const origin = `${above ? "bottom" : "top"} ${side.endsWith("end") ? "right" : side.endsWith("start") ? "left" : "center"}`;
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: "menu" }),
    useListNavigation(context, { listRef, activeIndex, onNavigate: setActiveIndex, loop: true }),
    useTypeahead(context, { listRef: labelsRef, activeIndex, onMatch: setActiveIndex }),
  ]);
  const child = Children.only(trigger) as AnyElement;
  const ref = useMergeRefs([refs.setReference, child.props.ref]);

  return (
    <>
      {cloneElement(child, {
        ...getReferenceProps({ ...child.props, ref }),
        "data-open": open || undefined,
      })}
      <FloatingPortal>
        <AnimatePresence>
          {open ? (
            <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                className="z-[350]"
                {...getFloatingProps()}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: above ? 4 : -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFast }}
                  transition={snappy}
                  className={cn(panel, "overflow-hidden p-1")}
                  style={{ width, transformOrigin: origin }}
                >
                  {header}
                  <MenuItems
                    items={items}
                    activeIndex={activeIndex}
                    listRef={listRef}
                    getItemProps={getItemProps}
                    onDone={() => setOpen(false)}
                  />
                </motion.div>
              </div>
            </FloatingFocusManager>
          ) : null}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}

/** The rows of a Menu or a context menu: items, separators and group labels. */
function MenuItems({
  items,
  activeIndex,
  listRef,
  getItemProps,
  onDone,
}: {
  items: MenuEntry[];
  activeIndex: number | null;
  listRef: MutableRefObject<Array<HTMLElement | null>>;
  getItemProps: ReturnType<typeof useInteractions>["getItemProps"];
  onDone: () => void;
}) {
  let index = -1;
  return items.map((item) => {
    if (item.type === "separator") return <div key={item.id} className="mx-1 my-1 h-px bg-line" />;
    if (item.type === "label")
      return (
        <div key={item.id} className="label-caps px-2.5 pt-2 pb-1 text-[10px]">
          {item.label}
        </div>
      );
    index += 1;
    const i = index;
    const active = activeIndex === i;
    return (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        tabIndex={active ? 0 : -1}
        disabled={item.disabled}
        ref={(node) => {
          listRef.current[i] = node;
        }}
        className={cn(
          "flex h-8 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm outline-none",
          item.tone === "danger" ? "text-red-ink" : "text-fg-2",
          active && (item.tone === "danger" ? "bg-red/15" : "bg-fg/8 text-fg"),
          item.disabled && "opacity-40",
        )}
        {...getItemProps({
          onClick() {
            item.onSelect();
            onDone();
          },
        })}
      >
        {item.icon ? <Icon name={item.icon} size={16} className="opacity-80" /> : null}
        <span className="flex-1 truncate">{item.label}</span>
        {item.hint}
        {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
      </button>
    );
  });
}

/* ── Context menu ────────────────────────────────────────────────────────── */

interface OpenContextMenu {
  x: number;
  y: number;
  items: MenuEntry[];
  /** Bumped on every open, so a second right-click replays the entrance. */
  key: number;
}

const useContextMenu = create<{ menu: OpenContextMenu | null }>(() => ({ menu: null }));
const closeContextMenu = () => useContextMenu.setState({ menu: null });

/**
 * Right-click: `onContextMenu={(e) => openContextMenu(e, items)}` opens the menu at the pointer
 * (under the element when it comes from the keyboard: Shift+F10 or the menu key). It looks and
 * works like Menu. Build the items in the handler, so a grid of cards builds none until used.
 */
export function openContextMenu(e: MouseEvent<HTMLElement>, items: MenuEntry[]): void {
  if (!items.length) return;
  e.preventDefault();
  e.stopPropagation();
  let { clientX: x, clientY: y } = e;
  if (x === 0 && y === 0) {
    const r = e.currentTarget.getBoundingClientRect();
    x = r.left + 8;
    y = r.top + Math.min(r.height, 32);
  }
  useContextMenu.setState((s) => ({ menu: { x, y, items, key: (s.menu?.key ?? 0) + 1 } }));
}

/** Renders the open right-click menu. Mounted once, next to the Toaster. */
export function ContextMenuHost() {
  const menu = useContextMenu((s) => s.menu);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const labelsRef = useRef<Array<string | null>>([]);
  const items = menu?.items ?? [];
  labelsRef.current = items
    .filter((i) => i.type === undefined || i.type === "item")
    .map((i) => ("label" in i ? i.label : null));
  const { refs, floatingStyles, context } = useFloating({
    open: menu !== null,
    onOpenChange: (open) => {
      if (!open) closeContextMenu();
    },
    placement: "right-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset({ mainAxis: 2, alignmentAxis: 2 }),
      flip({ padding: 8, fallbackPlacements: ["left-start", "right-end", "left-end"] }),
      shift({ padding: 8 }),
    ],
  });
  useLayoutEffect(() => {
    if (!menu) return;
    const { x, y } = menu;
    refs.setPositionReference({
      getBoundingClientRect: () => ({
        x,
        y,
        left: x,
        top: y,
        right: x,
        bottom: y,
        width: 0,
        height: 0,
      }),
    });
    setActiveIndex(null);
  }, [menu, refs]);
  // A native menu closes when the page under it moves.
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (!(e.target instanceof Node && refs.floating.current?.contains(e.target)))
        closeContextMenu();
    };
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [menu, refs]);
  const { getFloatingProps, getItemProps } = useInteractions([
    useDismiss(context),
    useRole(context, { role: "menu" }),
    useListNavigation(context, { listRef, activeIndex, onNavigate: setActiveIndex, loop: true }),
    useTypeahead(context, { listRef: labelsRef, activeIndex, onMatch: setActiveIndex }),
  ]);
  return (
    <FloatingPortal>
      <AnimatePresence>
        {menu ? (
          // Focus goes to the panel, so arrow keys and typeahead work right away.
          <FloatingFocusManager
            key={menu.key}
            context={context}
            modal={false}
            initialFocus={refs.floating}
          >
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="z-[350] outline-none"
              {...getFloatingProps()}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFast }}
                transition={{ duration: 0.09 }}
                className={cn(panel, "overflow-hidden p-1")}
                style={{ width: 230, transformOrigin: "top left" }}
              >
                <MenuItems
                  items={items}
                  activeIndex={activeIndex}
                  listRef={listRef}
                  getItemProps={getItemProps}
                  onDone={closeContextMenu}
                />
              </motion.div>
            </div>
          </FloatingFocusManager>
        ) : null}
      </AnimatePresence>
    </FloatingPortal>
  );
}
