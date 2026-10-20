/**
 * Ctrl+↑ / Ctrl+↓ in the prompt editor: change the weight of what's under the cursor.
 *
 *   inside <lora:name:0.8>          → the model strength (a CLIP strength stays as it is)
 *   inside (tag:1.2) or (a, b:0.9)  → that group's weight; reaching 1 removes the group
 *   inside (tag) without a weight   → read as 1.1, written as (tag:1.15)
 *   a selection or the tag at the cursor (between commas) → wrapped as (tag:1.05)
 *
 * Pure: text and selection in, text and selection out (null when there's nothing to change).
 */

export interface WeightEdit {
  text: string;
  /** The new selection: the weighted text, without the parentheses and weight. */
  from: number;
  to: number;
}

const LORA = /<lora:([^:>]+)(?::([^:>]*))?(?::([^:>]*))?>/gi;
const WEIGHT_TAIL = /:\s*(-?\d+(?:\.\d+)?)\s*$/;
/** Characters that end a tag when looking for "the tag at the cursor". */
const BOUNDARY = /[,\n|{}]/;

function fmt(n: number): string {
  return String(Number(n.toFixed(2)));
}

function clampWeight(n: number): number {
  return Math.min(3, Math.max(0, Number(n.toFixed(2))));
}

function escaped(text: string, i: number): boolean {
  let n = 0;
  for (let j = i - 1; j >= 0 && text[j] === "\\"; j--) n++;
  return n % 2 === 1;
}

/** The innermost unescaped (…) pair around [from, to], as offsets of the parentheses. */
function enclosingParens(text: string, from: number, to: number): [number, number] | null {
  const stack: number[] = [];
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ((c !== "(" && c !== ")") || escaped(text, i)) continue;
    if (c === "(") stack.push(i);
    else {
      const open = stack.pop();
      if (open !== undefined) pairs.push([open, i]);
    }
  }
  let best: [number, number] | null = null;
  for (const [open, close] of pairs)
    if (open < from && close >= to && (!best || open > best[0])) best = [open, close];
  return best;
}

function nudgeLora(text: string, from: number, to: number, delta: number): WeightEdit | null {
  for (const m of text.matchAll(LORA)) {
    const start = m.index;
    const end = start + m[0].length;
    // The cursor is inside the tag (anywhere from after "<" to before ">").
    if (!(from > start && to < end)) continue;
    const name = (m[1] ?? "").trim();
    const current = m[2] === undefined || m[2].trim() === "" ? 1 : Number(m[2]);
    if (!Number.isFinite(current)) return null;
    const next = clampWeight(current + delta);
    const clip = m[3] !== undefined && m[3].trim() !== "" ? `:${m[3].trim()}` : "";
    const tag = `<lora:${name}:${fmt(next)}${clip}>`;
    const caret = start + tag.length - 1 - clip.length;
    return { text: text.slice(0, start) + tag + text.slice(end), from: caret, to: caret };
  }
  return null;
}

/** The tag around the cursor: between the nearest boundaries, trimmed. */
function tagAt(text: string, pos: number): [number, number] | null {
  let a = pos;
  while (a > 0 && !BOUNDARY.test(text[a - 1] ?? "")) a--;
  let b = pos;
  while (b < text.length && !BOUNDARY.test(text[b] ?? "")) b++;
  while (a < b && /\s/.test(text[a] ?? "")) a++;
  while (b > a && /\s/.test(text[b - 1] ?? "")) b--;
  return b > a ? [a, b] : null;
}

export function nudgeWeight(
  text: string,
  from: number,
  to: number,
  delta: number,
): WeightEdit | null {
  const lora = nudgeLora(text, from, to, delta);
  if (lora) return lora;

  const group = enclosingParens(text, from, to);
  if (group) {
    const [open, close] = group;
    const inner = text.slice(open + 1, close);
    const tail = WEIGHT_TAIL.exec(inner);
    const body = tail ? inner.slice(0, tail.index) : inner;
    const current = tail ? Number(tail[1]) : 1.1;
    const next = clampWeight(current + delta);
    const before = text.slice(0, open);
    const after = text.slice(close + 1);
    if (next === 1) return { text: before + body + after, from: open, to: open + body.length };
    const wrapped = `(${body}:${fmt(next)})`;
    return { text: before + wrapped + after, from: open + 1, to: open + 1 + body.length };
  }

  let range: [number, number] | null = from !== to ? [from, to] : tagAt(text, from);
  if (!range) return null;
  // A selection with spaces around it weights only the words.
  let [a, b] = range;
  while (a < b && /\s/.test(text[a] ?? "")) a++;
  while (b > a && /\s/.test(text[b - 1] ?? "")) b--;
  range = [a, b];
  if (a === b) return null;
  const body = text.slice(a, b);
  const next = clampWeight(1 + delta);
  if (next === 1) return null;
  const wrapped = `(${body}:${fmt(next)})`;
  return {
    text: text.slice(0, a) + wrapped + text.slice(b),
    from: a + 1,
    to: a + 1 + body.length,
  };
}
