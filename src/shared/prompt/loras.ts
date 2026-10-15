/**
 * <lora:…> tags in prompts. The prompt is the single place LoRAs are chosen: the models strip
 * edits the tags, and the compiler moves them out of the text into the graph's LoRA stack.
 *
 *   <lora:name>              strength 1
 *   <lora:name:0.8>          model and CLIP strength 0.8
 *   <lora:name:0.8:0.5>      model 0.8, CLIP 0.5
 */

export interface LoraTag {
  name: string;
  strength: number;
  /** Separate CLIP strength; null means "same as strength". */
  clipStrength: number | null;
  /** Offsets of the whole tag in the text. */
  start: number;
  end: number;
}

const TAG = /<lora:([^:>]+)(?::([^:>]*))?(?::([^:>]*))?>/gi;

function num(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Well-formed LoRA tags, in order. Malformed ones are skipped (the editor flags them). */
export function findLoraTags(text: string): LoraTag[] {
  const out: LoraTag[] = [];
  for (const m of text.matchAll(TAG)) {
    const name = (m[1] ?? "").trim();
    const strength = num(m[2]);
    const clip = num(m[3]);
    if (!name || Number.isNaN(strength) || Number.isNaN(clip)) continue;
    out.push({
      name,
      strength: strength ?? 1,
      clipStrength: clip,
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

/** Format a tag, dropping trailing zeros ("0.80" → "0.8"). */
export function formatLoraTag(
  name: string,
  strength: number,
  clipStrength?: number | null,
): string {
  const f = (n: number) => String(Number(n.toFixed(3)));
  const clip = clipStrength === null || clipStrength === undefined ? "" : `:${f(clipStrength)}`;
  return `<lora:${name}:${f(strength)}${clip}>`;
}

/** Replace one tag's strength, keeping everything else in the prompt as typed. */
export function setLoraStrength(text: string, tag: LoraTag, strength: number): string {
  return (
    text.slice(0, tag.start) +
    formatLoraTag(tag.name, strength, tag.clipStrength) +
    text.slice(tag.end)
  );
}

/** Remove one tag and the separator that came before it. */
export function removeLoraTag(text: string, tag: LoraTag): string {
  const before = text.slice(0, tag.start).replace(/[,\s]*$/, "");
  const after = text.slice(tag.end);
  return before && after && !/^[,\s]/.test(after) ? `${before}, ${after}` : before + after;
}

/** The prompt without any LoRA tags, with leftover separators tidied up. */
export function stripLoraTags(text: string): string {
  return text
    .replace(TAG, "")
    .replace(/[ \t]*,[ \t]*(,[ \t]*)+/g, ", ")
    .replace(/^[ \t]*,[ \t]*/gm, "")
    .replace(/[ \t]*,[ \t]*$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
