/**
 * Read saved data as well as possible. A file or manifest that's mostly fine shouldn't lose
 * everything to one bad value: a number out of range is pulled to the nearest limit, any other
 * invalid value is removed (so its default applies), and a bad list item is dropped on its own.
 * Each fix is retried against the schema until it passes (or nothing more can be removed).
 */
import type { z } from "zod";

export interface Salvaged<T> {
  data: T;
  /** What had to change ("hires.steps", "adetailer.units.1"); empty when the input was valid. */
  fixed: string[];
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A copy of `value` (plain objects and arrays), so the caller's data is never changed. */
function copy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copy);
  if (isPlain(value))
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
  return value;
}

/**
 * Change the value at `path`: `replace` it (a clamped number) or remove it; inside an array the
 * item is dropped as a whole. Returns false when there's nothing there to change.
 */
function fixAt(root: unknown, path: PropertyKey[], replace?: number): boolean {
  let node: unknown = root;
  for (let i = 0; i < path.length; i++) {
    const key = path[i] as PropertyKey;
    const last = i === path.length - 1;
    if (Array.isArray(node)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= node.length) return false;
      if (last && replace !== undefined) node[index] = replace;
      else if (last || !(isPlain(node[index]) || Array.isArray(node[index]))) node.splice(index, 1);
      else {
        node = node[index];
        continue;
      }
      return true;
    }
    if (!isPlain(node) || typeof key === "symbol" || !(key in node)) return false;
    if (last) {
      if (replace !== undefined) node[key] = replace;
      else delete node[key];
      return true;
    }
    node = node[key];
  }
  return false;
}

/** Parse `value` with `schema`, fixing what's invalid instead of throwing it all away. */
export function salvage<S extends z.ZodType>(schema: S, value: unknown): Salvaged<z.output<S>> {
  const work = copy(value ?? {});
  const fixed: string[] = [];
  for (let attempt = 0; attempt < 200; attempt++) {
    const parsed = schema.safeParse(work);
    if (parsed.success) return { data: parsed.data, fixed };
    const issue = parsed.error.issues[0];
    if (!issue || issue.path.length === 0) break;
    const limit =
      issue.code === "too_big" && typeof issue.maximum === "number"
        ? issue.maximum
        : issue.code === "too_small" && typeof issue.minimum === "number"
          ? issue.minimum
          : undefined;
    // Only a number is clamped (a too-long string or list is removed instead).
    const current = issue.path.reduce<unknown>(
      (n, k) => (n && typeof n === "object" ? (n as Record<PropertyKey, unknown>)[k] : undefined),
      work,
    );
    const clamp = typeof current === "number" ? limit : undefined;
    // A required value that's missing can't be removed: drop what holds it instead (the list
    // item, or the object, so its default applies).
    let at = issue.path.length;
    let ok = fixAt(work, issue.path, clamp);
    while (!ok && --at > 0) ok = fixAt(work, issue.path.slice(0, at));
    if (!ok) break;
    fixed.push(issue.path.slice(0, at).map(String).join("."));
  }
  return { data: schema.parse({}), fixed: [...fixed, "*"] };
}
