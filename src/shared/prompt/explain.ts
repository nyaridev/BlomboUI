/**
 * What a prompt means, for the Help view's playground: each tag with the weight it ends up with
 * (A1111/ComfyUI rules), the LoRAs, wildcards and {a|b} choices it uses, and how it splits into
 * 75-token chunks at BREAK. Pure and approximate in the same way as `estimateTokens`: the real
 * tokenizer is CLIP's BPE, which only ComfyUI has.
 *
 *   (tag)      ×1.1 per pair of parentheses     ((tag)) = ×1.21
 *   [tag]      ÷1.1 per pair of brackets
 *   (tag:1.5)  exactly 1.5 (times any brackets around it)
 *   \( \)      literal parentheses, no weight
 */
import { findLoraTags } from "./loras.ts";
import { estimateTokens, tokenizePrompt } from "./tokenize.ts";
import { findWildcards } from "./wildcards.ts";

export interface ExplainedTag {
  text: string;
  weight: number;
}

export interface ExplainedChunk {
  tags: ExplainedTag[];
  tokens: number;
}

export interface PromptExplanation {
  chunks: ExplainedChunk[];
  loras: Array<{ name: string; strength: number }>;
  wildcards: string[];
  /** Options of each {a|b|c} group, in order. */
  choices: string[][];
  /** Syntax problems, as the editor would underline them. */
  issues: string[];
}

const WEIGHT_TAIL = /:\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*$/;
const CHOICE = /\{([^{}]*\|[^{}]*)\}/g;

/** Weight multiplier at each character of `text` (LoRA tags already blanked out). */
function weights(text: string): Float64Array {
  const w = new Float64Array(text.length).fill(1);
  // Matching pairs first, so "(x:1.3)" knows its weight when it opens.
  const pairs = new Map<number, number>();
  const stack: Array<{ ch: string; at: number }> = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "(" || ch === "[") stack.push({ ch, at: i });
    else if (ch === ")" || ch === "]") {
      const want = ch === ")" ? "(" : "[";
      const top = stack[stack.length - 1];
      if (top && top.ch === want) {
        stack.pop();
        pairs.set(top.at, i);
      }
    }
  }
  const factors: Array<{ until: number; f: number }> = [];
  let current = 1;
  for (let i = 0; i < text.length; i++) {
    while (factors.length && (factors[factors.length - 1] as { until: number }).until < i) {
      current /= (factors.pop() as { f: number }).f;
    }
    const ch = text[i];
    if (ch === "\\") {
      w[i] = current;
      if (i + 1 < text.length) w[i + 1] = current;
      i++;
      continue;
    }
    const close = pairs.get(i);
    if (close !== undefined) {
      let f = ch === "(" ? 1.1 : 1 / 1.1;
      if (ch === "(") {
        const m = WEIGHT_TAIL.exec(text.slice(i + 1, close));
        if (m) f = Number(m[1]);
      }
      factors.push({ until: close, f });
      current *= f;
    }
    w[i] = current;
  }
  return w;
}

/** Bracket syntax removed; escaped brackets (`\(`) kept as plain characters. */
export function stripBrackets(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    const next = text[i + 1] ?? "";
    if (ch === "\\" && "()[]".includes(next)) {
      out += next;
      i++;
    } else if (!"()[]".includes(ch)) out += ch;
  }
  return out;
}

/** One tag without its syntax: brackets, weights, escapes ("(cat:1.2)" → "cat"). */
export function cleanTag(raw: string): string {
  // Weights go first, while the escaped brackets are still marked.
  const noWeights = raw.replace(/:\s*[+-]?(?:\d+\.?\d*|\.\d+)\s*(?=\)|\]|$)/g, "");
  return stripBrackets(noWeights).replace(/\s+/g, " ").trim();
}

export function explainPrompt(text: string): PromptExplanation {
  const issues = tokenizePrompt(text)
    .filter((t) => t.type === "invalid")
    .map((t) => t.message ?? "Syntax problem");
  const loras = findLoraTags(text).map((t) => ({ name: t.name, strength: t.strength }));
  const wildcards = findWildcards(text);
  const choices = [...text.matchAll(CHOICE)].map((m) =>
    (m[1] as string).split("|").map((s) => s.trim()),
  );
  // Blank LoRA tags so their colons and numbers don't read as weights.
  const blanked = text.replace(/<lora:[^>]*>/gi, (m) => " ".repeat(m.length));
  const w = weights(blanked);
  const chunks: ExplainedChunk[] = [];
  let offset = 0;
  for (const part of blanked.split(/\bBREAK\b/)) {
    const tags: ExplainedTag[] = [];
    // Split on commas that aren't inside a {a|b} choice.
    let depth = 0;
    let start = 0;
    const pieces: Array<{ from: number; text: string }> = [];
    for (let i = 0; i <= part.length; i++) {
      const ch = part[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth = Math.max(0, depth - 1);
      if (i === part.length || (ch === "," && depth === 0) || ch === "\n") {
        pieces.push({ from: start, text: part.slice(start, i) });
        start = i + 1;
      }
    }
    for (const p of pieces) {
      const clean = cleanTag(p.text);
      if (!clean) continue;
      const first = p.text.search(/[^\s()[\]\\]/);
      const weight = w[offset + p.from + Math.max(0, first)] ?? 1;
      tags.push({ text: clean, weight: Math.round(weight * 1000) / 1000 });
    }
    chunks.push({ tags, tokens: estimateTokens(part).tokens });
    offset += part.length + "BREAK".length;
  }
  return { chunks, loras, wildcards, choices, issues };
}
