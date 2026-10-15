/** Text inputs and the Field wrapper that gives any control a label, hint and error. */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useId,
  useLayoutEffect,
  useRef,
} from "react";

const fieldBox =
  "flex min-w-0 items-center gap-2 rounded-md border bg-field text-sm text-fg transition-[border-color,box-shadow] duration-150 " +
  "border-line hover:border-line-strong focus-within:border-accent-ink/70 focus-within:ring-2 focus-within:ring-accent/25";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  icon?: IconName;
  trailing?: ReactNode;
  size?: "sm" | "md" | "lg";
  invalid?: boolean;
  onClear?: () => void;
  mono?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({
  icon,
  trailing,
  size = "md",
  invalid,
  onClear,
  mono,
  className,
  value,
  ...rest
}: TextFieldProps) {
  const h = size === "sm" ? "h-7 px-2" : size === "lg" ? "h-10 px-3" : "h-8 px-2.5";
  return (
    <div
      className={cn(
        fieldBox,
        h,
        invalid && "border-red/70 focus-within:border-red-ink focus-within:ring-red/25",
        rest.disabled && "opacity-45",
        className,
      )}
    >
      {icon ? <Icon name={icon} size={15} className="text-fg-3" /> : null}
      <input
        value={value}
        size={1}
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-4",
          mono && "font-mono text-[12.5px]",
        )}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {onClear && value ? (
        <button
          type="button"
          aria-label="Clear"
          onClick={onClear}
          className="grid h-5 w-5 place-items-center rounded-xs text-fg-3 hover:bg-field-hover hover:text-fg"
        >
          <Icon name="x" size={13} />
        </button>
      ) : null}
      {trailing}
    </div>
  );
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoGrow?: boolean;
  maxRows?: number;
  mono?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextArea({
  autoGrow = true,
  maxRows = 12,
  mono,
  className,
  value,
  ...rest
}: TextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !autoGrow) return;
    el.style.height = "auto";
    const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 19;
    el.style.height = `${Math.min(el.scrollHeight, line * maxRows + 16)}px`;
  }, [value, autoGrow, maxRows]);
  return (
    <textarea
      ref={ref}
      value={value}
      className={cn(
        "min-h-16 w-full resize-y rounded-md border border-line bg-field px-2.5 py-2 text-sm text-fg outline-none transition-[border-color,box-shadow]",
        "placeholder:text-fg-4 hover:border-line-strong focus:border-accent-ink/70 focus:ring-2 focus:ring-accent/25",
        mono && "font-mono text-[12.5px] leading-relaxed",
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Field: label + control + hint/error. `layout="left"` puts the label in a fixed column,
 * which is how settings rows read best.
 */
export function Field({
  label,
  hint,
  error,
  children,
  layout = "top",
  labelWidth = 180,
  action,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode | ((id: string) => ReactNode);
  layout?: "top" | "left";
  labelWidth?: number;
  action?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const body = typeof children === "function" ? children(id) : children;
  const meta = error ? (
    <span className="flex items-center gap-1 text-xs text-danger">
      <Icon name="errors" size={13} />
      {error}
    </span>
  ) : hint ? (
    <span className="text-xs text-fg-3">{hint}</span>
  ) : null;
  if (layout === "left") {
    return (
      <div
        className={cn("grid items-start gap-x-6 gap-y-1", className)}
        style={{ gridTemplateColumns: `${labelWidth}px minmax(0,1fr)` }}
      >
        <label htmlFor={id} className="pt-1.5 text-sm text-fg-2">
          {label}
        </label>
        <div className="flex min-w-0 flex-col gap-1.5">
          {body}
          {meta}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-fg-2">
          {label}
        </label>
        {action}
      </div>
      {body}
      {meta}
    </div>
  );
}
