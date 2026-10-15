/** Join class names, skipping falsy values. Deliberately tiny: no merging magic, so order matters. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
