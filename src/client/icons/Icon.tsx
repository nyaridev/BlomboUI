import { cn } from "@client/lib/cn";
import type { SVGProps } from "react";
import { ICONS, type IconName } from "./paths";

export type { IconName };

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  /** Pixel size; the stroke scales with it. Default 16. */
  size?: number;
  strokeWidth?: number;
}

/** One component for the whole icon set. Icon-only buttons get their label from IconButton. */
export function Icon({ name, size = 16, strokeWidth = 1.75, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
      {...rest}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
