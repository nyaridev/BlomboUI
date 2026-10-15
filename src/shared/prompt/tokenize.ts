/**
 * Prompt syntax tokenizer, shared by the prompt editor (highlighting), the help guide and,
 * later, the compiler. A1111/ComfyUI conventions:
 *   (tag)  ((tag))  (tag:1.3)   emphasis / explicit weight
 *   [tag]                        de-emphasis
 *   \( \) \[ \]                  literal brackets
 *   <lora:name>  <lora:name:0.8> LoRA with optional strength
 *   __path/name__                wildcard
 *   BREAK                        start a new 75-token chunk
 * Unbalanced brackets and malformed LoRA tags are reported as `invalid`.
 */

export type TokenType =
  | "paren"
  | "bracket"
  | "weight"
  | "lora"
  | "lora-name"
  | "lora-strength"
  | "wildcard"
  | "break"
  | "escape"
  | "invalid";

export interface Token {
  from: number;
  to: number;
  type: TokenType;
  /** Nesting depth for parens/brackets (1-based). */
  depth?: number;
  message?: string;
}

const LORA = /<lora:([^:>]*)(?::([^>]*))?>/gi;
const LORA_OPEN = /<lora:[^>]*$/gim;
const WILDCARD = /__([^\s_][^\s]*?)__/g;
const BREAK = /\bBREAK\b/g;
const ESCAPE = /\\[()[\]]/g;
const WEIGHT_TAIL = /:\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*$/;

export function tokenizePrompt(text: string): Token[] {
  const tokens: Token[] = [];
  const covered = new Uint8Array(text.length);
  const cover = (from: number, to: number) => covered.fill(1, from, to);

  for (const m of text.matchAll(ESCAPE)) {
    tokens.push({ from: m.index, to: m.index + 2, type: "escape" });
    cover(m.index, m.index + 2);
  }
  for (const m of text.matchAll(LORA)) {
    const from = m.index;
    const to = from + m[0].length;
    const name = m[1] ?? "";
    const strength = m[2];
    const bad =
      !name.trim() ||
      (strength !== undefined && !/^\s*[+-]?(\d+\.?\d*|\.\d+)\s*(:.*)?$/.test(strength));
    if (bad) {
      tokens.push({
        from,
        to,
        type: "invalid",
        message: !name.trim() ? "LoRA tag has no name" : "LoRA strength must be a number",
      });
    } else {
      tokens.push({ from, to, type: "lora" });
      const nameFrom = from + 6;
      tokens.push({ from: nameFrom, to: nameFrom + name.length, type: "lora-name" });
      if (strength !== undefined) {
        const sFrom = nameFrom + name.length + 1;
        tokens.push({ from: sFrom, to: sFrom + strength.length, type: "lora-strength" });
      }
    }
    cover(from, to);
  }
  for (const m of text.matchAll(LORA_OPEN)) {
    if (covered[m.index]) continue;
    tokens.push({
      from: m.index,
      to: m.index + m[0].length,
      type: "invalid",
      message: "LoRA tag is missing its closing >",
    });
    cover(m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(WILDCARD)) {
    if (covered[m.index]) continue;
    tokens.push({ from: m.index, to: m.index + m[0].length, type: "wildcard" });
    cover(m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(BREAK)) {
    if (covered[m.index]) continue;
    tokens.push({ from: m.index, to: m.index + 5, type: "break" });
    cover(m.index, m.index + 5);
  }

  // Bracket matching on what's left.
  const stack: Array<{ ch: "(" | "["; at: number }> = [];
  for (let i = 0; i < text.length; i++) {
    if (covered[i]) continue;
    const ch = text[i];
    if (ch === "(" || ch === "[") {
      stack.push({ ch, at: i });
    } else if (ch === ")" || ch === "]") {
      const want = ch === ")" ? "(" : "[";
      const top = stack[stack.length - 1];
      if (!top || top.ch !== want) {
        tokens.push({ from: i, to: i + 1, type: "invalid", message: `Unmatched "${ch}"` });
        continue;
      }
      stack.pop();
      const depth = stack.filter((s) => s.ch === want).length + 1;
      const type = want === "(" ? "paren" : "bracket";
      tokens.push({ from: top.at, to: top.at + 1, type, depth });
      tokens.push({ from: i, to: i + 1, type, depth });
      if (want === "(") {
        const inner = text.slice(top.at + 1, i);
        const w = WEIGHT_TAIL.exec(inner);
        if (w) {
          const wFrom = top.at + 1 + (w.index ?? 0);
          tokens.push({ from: wFrom, to: i, type: "weight" });
        }
      }
    }
  }
  for (const open of stack) {
    tokens.push({
      from: open.at,
      to: open.at + 1,
      type: "invalid",
      message: `"${open.ch}" is never closed`,
    });
  }

  return tokens.sort((a, b) => a.from - b.from || b.to - a.to);
}

/** Rough CLIP token estimate for the counter (BPE-free: words and punctuation). */
export function estimateTokens(text: string): { tokens: number; chunks: number } {
  const parts = text.split(/\bBREAK\b/);
  let total = 0;
  let chunks = 0;
  for (const part of parts) {
    const n = (part.match(/[\w']+|[^\s\w]/g) ?? []).length;
    total += n;
    chunks += Math.max(1, Math.ceil(n / 75));
  }
  return { tokens: total, chunks };
}
