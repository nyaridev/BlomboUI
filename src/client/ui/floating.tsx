/**
 * Everything that floats: Tooltip, Popover, Menu. Behavior (positioning, dismissal, focus,
 * keyboard navigation, typeahead) comes from Floating UI; every pixel of the look is ours.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
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
  type ReactElement,
  type ReactNode,
  type Ref,
  useRef,
  useState,
} from "react";
import { Kbd } from "./feedback";

type AnyElement = ReactElement<Record<string, unknown> & { ref?: Ref<HTMLElement> }>;

const panel = "rounded-lg border border-line-strong bg-surface-3 text-fg shadow-pop outline-none";

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
              className="z-[200]"
              {...getFloatingProps()}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ duration: 0.12 }}
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
                className="z-[150]"
                {...getFloatingProps()}
              >
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -2, scale: 0.99, transition: { duration: 0.1 } }}
                  transition={{ type: "spring", stiffness: 620, damping: 40, mass: 0.6 }}
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

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: "menu" }),
    useListNavigation(context, { listRef, activeIndex, onNavigate: setActiveIndex, loop: true }),
    useTypeahead(context, { listRef: labelsRef, activeIndex, onMatch: setActiveIndex }),
  ]);
  const child = Children.only(trigger) as AnyElement;
  const ref = useMergeRefs([refs.setReference, child.props.ref]);

  let index = -1;
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
                className="z-[150]"
                {...getFloatingProps()}
              >
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -2, transition: { duration: 0.1 } }}
                  transition={{ type: "spring", stiffness: 620, damping: 40, mass: 0.6 }}
                  className={cn(panel, "overflow-hidden p-1")}
                  style={{
                    width,
                    transformOrigin: placement.endsWith("end") ? "top right" : "top left",
                  }}
                >
                  {header}
                  {items.map((item) => {
                    if (item.type === "separator")
                      return <div key={item.id} className="mx-1 my-1 h-px bg-line" />;
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
                          "flex h-8 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm outline-none transition-colors",
                          item.tone === "danger" ? "text-red-ink" : "text-fg-2",
                          active && (item.tone === "danger" ? "bg-red/15" : "bg-field text-fg"),
                          item.disabled && "opacity-40",
                        )}
                        {...getItemProps({
                          onClick() {
                            item.onSelect();
                            setOpen(false);
                          },
                        })}
                      >
                        {item.icon ? (
                          <Icon name={item.icon} size={16} className="opacity-80" />
                        ) : null}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.hint}
                        {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
                      </button>
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
