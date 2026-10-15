/**
 * Wildcard and choice expansion, seeded so an image's seed reproduces its prompt.
 *
 *   __path/name__   a random line from <wildcards>/path/name.txt
 *   {red|blue|green}  one of the options
 *
 * Picked lines may contain more wildcards or choices; expansion repeats up to a depth limit so
 * a wildcard that includes itself can't loop forever. Reading files is the caller's job
 * (`resolve`), which keeps this module pure.
 */

export type WildcardResolver = (name: string) => readonly string[] | undefined;

export interface ExpandResult {
  text: string;
  /** Wildcards that were expanded, in first-use order. */
  used: string[];
  /** Wildcards the resolver didn't know. Their text is left as typed. */
  missing: string[];
}

const WILDCARD = /__([^\s_][^\s]*?)__/g;
/** An innermost {…|…} group: no nested braces inside. */
const CHOICE = /\{([^{}]*\|[^{}]*)\}/g;

export function expandPrompt(
  text: string,
  random: () => number,
  resolve: WildcardResolver,
  maxDepth = 10,
): ExpandResult {
  const used: string[] = [];
  const missing: string[] = [];
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;

  let out = text;
  for (let depth = 0; depth < maxDepth; depth++) {
    let changed = false;
    out = out.replace(CHOICE, (_all, body: string) => {
      changed = true;
      return pick(body.split("|"));
    });
    out = out.replace(WILDCARD, (all, name: string) => {
      const lines = resolve(name);
      if (!lines || lines.length === 0) {
        if (!missing.includes(name)) missing.push(name);
        return all;
      }
      if (!used.includes(name)) used.push(name);
      changed = true;
      return pick(lines);
    });
    if (!changed) break;
  }
  return { text: out, used, missing };
}

/** Lines of a wildcard file that count as options: no blanks, no `#` comments. */
export function wildcardLines(fileText: string): string[] {
  return fileText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

/** Wildcard names used in a prompt, without expanding anything. */
export function findWildcards(text: string): string[] {
  return [...new Set([...text.matchAll(WILDCARD)].map((m) => m[1] as string))];
}
