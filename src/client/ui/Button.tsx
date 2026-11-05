import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Kbd, Spinner } from "./feedback";
import { Tooltip } from "./floating";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "overlay";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium " +
  "transition-[background-color,border-color,color,box-shadow,transform] ease-out " +
  "active:scale-[0.97] disabled:pointer-events-none focus-ring";

/** Disabled looks: filled buttons turn a solid quiet fill with dim text, bare ones only dim. */
const solidOff = "disabled:border-transparent disabled:bg-disabled disabled:text-on-disabled";
const bareOff = "disabled:text-on-disabled";

const variants: Record<ButtonVariant, string> = {
  primary: `bg-accent text-on-accent hover:brightness-110 ${solidOff}`,
  secondary: `border border-line bg-field text-fg hover:border-line-strong hover:bg-field-hover ${solidOff}`,
  outline: `border border-line-strong text-fg-2 hover:border-fg-4 hover:text-fg ${bareOff}`,
  ghost: `text-fg-2 hover:bg-field hover:text-fg ${bareOff}`,
  /** Over a picture: the same in every theme. */
  overlay: `bg-black/55 text-white backdrop-blur-[2px] hover:bg-black/75 ${bareOff}`,
  danger:
    "border border-red/35 bg-red/12 text-red-ink hover:bg-red/22 " +
    "disabled:border-transparent disabled:bg-disabled-danger disabled:text-on-disabled",
};

/** A toggle that's on: a tinted fill. Orange only for toggles in the Generate stack. */
const pressedLooks = {
  accent: `border border-accent/60 bg-accent/15 text-fg hover:bg-accent/22 ${solidOff}`,
  generate: `border border-generate/50 bg-generate/15 text-generate-ink hover:bg-generate/22 ${solidOff}`,
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
  /** Makes it a toggle (aria-pressed); when on it shows `tone`'s tinted fill. */
  pressed?: boolean;
  tone?: keyof typeof pressedLooks;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading,
  pressed,
  tone = "accent",
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
      aria-pressed={pressed}
      className={cn(base, pressed ? pressedLooks[tone] : variants[variant], sizes[size], className)}
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
  size?: "xs" | "sm" | "md" | "lg" | "tall";
  variant?: "ghost" | "secondary" | "primary" | "danger" | "overlay";
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
  /** As tall as its row (the result strip's side arrows). */
  tall: ["h-full w-7 rounded-md", 16],
} as const;

const iconVariants = {
  ghost: `text-fg-3 hover:bg-field hover:text-fg ${bareOff}`,
  secondary: `border border-line bg-field text-fg-2 hover:border-line-strong hover:text-fg ${solidOff}`,
  primary: `bg-accent text-on-accent hover:brightness-110 ${solidOff}`,
  danger: `text-fg-3 hover:bg-red/15 hover:text-red-ink ${bareOff}`,
  /** Over a picture (cards): dark and white whatever the theme, like ModelCard's corner buttons. */
  overlay: `bg-black/60 text-white/85 backdrop-blur-[2px] hover:bg-black/80 hover:text-white aria-expanded:bg-black/80 aria-expanded:text-white ${bareOff}`,
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
        active && variant !== "overlay" && "bg-field text-accent-ink",
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
