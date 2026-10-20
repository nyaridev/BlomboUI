import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Kbd, Spinner } from "./feedback";
import { Tooltip } from "./floating";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 focus-ring";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent shadow-[var(--bevel-primary)] hover:brightness-110",
  secondary: "border border-line bg-field text-fg hover:border-line-strong hover:bg-field-hover",
  outline: "border border-line-strong text-fg-2 hover:border-fg-4 hover:text-fg",
  ghost: "text-fg-2 hover:bg-field hover:text-fg",
  danger: "border border-red/35 bg-red/12 text-red-ink hover:bg-red/22",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 rounded-sm px-2.5 text-xs",
  md: "h-8 rounded-md px-3 text-sm",
  lg: "h-10 rounded-md px-4 text-sm font-semibold",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const iconSize = size === "lg" ? 17 : size === "sm" ? 14 : 15;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={iconSize} className="-mr-0.5 opacity-70" /> : null}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Accessible name and tooltip text. Required: icon-only buttons must say what they do. */
  label: string;
  shortcut?: string;
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "ghost" | "secondary" | "primary" | "danger";
  active?: boolean;
  tooltip?: boolean;
  badge?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const iconSizes = {
  xs: ["h-6 w-6 rounded-xs", 14],
  sm: ["h-7 w-7 rounded-sm", 15],
  md: ["h-8 w-8 rounded-md", 16],
  lg: ["h-10 w-10 rounded-md", 18],
} as const;

const iconVariants = {
  ghost: "text-fg-3 hover:bg-field hover:text-fg",
  secondary: "border border-line bg-field text-fg-2 hover:border-line-strong hover:text-fg",
  primary: "bg-accent text-on-accent hover:brightness-110",
  danger: "text-fg-3 hover:bg-red/15 hover:text-red-ink",
};

export function IconButton({
  icon,
  label,
  shortcut,
  size = "md",
  variant = "ghost",
  active,
  tooltip = true,
  badge,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  const [box, px] = iconSizes[size];
  const button = (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        base,
        box,
        iconVariants[variant],
        active && "bg-field text-accent-ink",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={px} />
      {badge}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip
      content={
        <span className="inline-flex items-center gap-2">
          {label}
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </span>
      }
    >
      {button}
    </Tooltip>
  );
}
