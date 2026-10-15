/**
 * Model descriptions from Civitai arrive as HTML written by strangers. Instead of sanitizing
 * that HTML and injecting it, it's parsed here into a few plain blocks (paragraphs, headings,
 * lists, quotes, code, images) of styled text runs. The client renders them as React elements,
 * so no markup from the outside ever reaches the page; links keep only http(s) targets.
 *
 * The tokenizer is deliberately forgiving: unknown tags are dropped, their text kept; script,
 * style and similar elements are dropped with their content.
 */
import { z } from "zod";

export const RichInline = z.object({
  text: z.string(),
  b: z.boolean().optional(),
  i: z.boolean().optional(),
  code: z.boolean().optional(),
  href: z.string().optional(),
});
export type RichInline = z.infer<typeof RichInline>;

export const RichBlock = z.discriminatedUnion("t", [
  z.object({ t: z.literal("p"), c: z.array(RichInline) }),
  z.object({ t: z.literal("h"), level: z.number().int().min(2).max(4), c: z.array(RichInline) }),
  z.object({ t: z.literal("list"), ordered: z.boolean(), items: z.array(z.array(RichInline)) }),
  z.object({ t: z.literal("quote"), c: z.array(RichInline) }),
  z.object({ t: z.literal("pre"), text: z.string() }),
  z.object({ t: z.literal("hr") }),
  z.object({ t: z.literal("img"), src: z.string(), alt: z.string() }),
]);
export type RichBlock = z.infer<typeof RichBlock>;

const MAX_BLOCKS = 400;
const DROP_CONTENT = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "svg",
]);
const BLOCK = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "table",
  "tr",
  "figure",
  "figcaption",
]);

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  middot: "·",
  bull: "•",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X"
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Read one attribute from a tag's attribute text. */
function attr(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(attrs);
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
}

/** An http(s) URL, with site-relative links resolved against `base`; anything else is null. */
export function safeHref(raw: string | null, base: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim(), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

interface Style {
  b: number;
  i: number;
  code: number;
  href: string[];
}

/**
 * HTML → blocks. `base` resolves relative links ("/models/1" → Civitai). Images keep their raw
 * source; the server decides which ones may be shown (through its image proxy) and drops the rest.
 */
export function htmlToBlocks(html: string, base = "https://civitai.com"): RichBlock[] {
  const blocks: RichBlock[] = [];
  const style: Style = { b: 0, i: 0, code: 0, href: [] };
  let inline: RichInline[] = [];
  let kind: "p" | "h" | "quote" = "p";
  let level = 2;
  let pre: string | null = null;
  let list: { ordered: boolean; items: RichInline[][] } | null = null;
  let listDepth = 0;
  let inItem = false;
  let dropping: string | null = null;
  let quoteDepth = 0;

  const flushInline = () => {
    const runs = tidy(inline);
    inline = [];
    if (!runs.length) return;
    if (list && inItem) {
      const last = list.items[list.items.length - 1];
      if (last) last.push(...(last.length ? [{ text: "\n" }, ...runs] : runs));
      return;
    }
    if (kind === "h") blocks.push({ t: "h", level, c: runs });
    else if (kind === "quote" || quoteDepth > 0) blocks.push({ t: "quote", c: runs });
    else blocks.push({ t: "p", c: runs });
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map(tidy).filter((i) => i.length);
    if (items.length) blocks.push({ t: "list", ordered: list.ordered, items });
    list = null;
  };
  const pushText = (text: string) => {
    if (!text) return;
    if (pre !== null) {
      pre += text;
      return;
    }
    const run: RichInline = { text };
    if (style.b) run.b = true;
    if (style.i) run.i = true;
    if (style.code) run.code = true;
    const href = style.href[style.href.length - 1];
    if (href) run.href = href;
    inline.push(run);
  };

  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)|</g;
  for (let m = re.exec(html); m && blocks.length < MAX_BLOCKS; m = re.exec(html)) {
    const [whole, close, rawTag, attrs = "", text] = m;
    if (whole.startsWith("<!--")) continue;
    if (text !== undefined || whole === "<") {
      if (dropping) continue;
      const decoded = decodeEntities(text ?? "<");
      pushText(pre !== null ? decoded : decoded.replace(/\s+/g, " "));
      continue;
    }
    const tag = (rawTag ?? "").toLowerCase();
    if (dropping) {
      if (close && tag === dropping) dropping = null;
      continue;
    }
    if (DROP_CONTENT.has(tag)) {
      if (!close && !attrs.trim().endsWith("/")) dropping = tag;
      continue;
    }
    switch (tag) {
      case "b":
      case "strong":
        style.b += close ? -1 : 1;
        break;
      case "i":
      case "em":
        style.i += close ? -1 : 1;
        break;
      case "code":
        if (pre === null) style.code += close ? -1 : 1;
        break;
      case "a":
        if (close) style.href.pop();
        else style.href.push(safeHref(attr(attrs, "href"), base) ?? "");
        break;
      case "br":
        pushText("\n");
        break;
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        flushInline();
        if (!close) {
          kind = "h";
          level = Math.min(4, Math.max(2, Number(tag[1]) + (tag === "h1" ? 1 : 0)));
        } else kind = "p";
        break;
      case "blockquote":
        flushInline();
        quoteDepth = Math.max(0, quoteDepth + (close ? -1 : 1));
        kind = quoteDepth > 0 ? "quote" : "p";
        break;
      case "pre":
        if (close) {
          if (pre?.trim()) blocks.push({ t: "pre", text: pre.replace(/^\n+|\s+$/g, "") });
          pre = null;
        } else {
          flushInline();
          pre = "";
        }
        break;
      case "ul":
      case "ol":
        if (close) {
          listDepth = Math.max(0, listDepth - 1);
          if (listDepth === 0) {
            flushInline();
            inItem = false;
            flushList();
          }
        } else {
          if (listDepth === 0) {
            flushInline();
            list = { ordered: tag === "ol", items: [] };
          }
          listDepth++;
        }
        break;
      case "li":
        if (!list) break;
        flushInline();
        if (!close) {
          list.items.push([]);
          inItem = true;
        }
        break;
      case "hr":
        flushInline();
        flushList();
        blocks.push({ t: "hr" });
        break;
      case "img": {
        const src = attr(attrs, "src");
        const href = safeHref(src, base);
        if (href) {
          flushInline();
          if (!list) blocks.push({ t: "img", src: href, alt: attr(attrs, "alt") ?? "" });
        }
        break;
      }
      default:
        if (BLOCK.has(tag) || tag === "td" || tag === "th") flushInline();
    }
  }
  flushInline();
  flushList();
  if (pre !== null && (pre as string).trim())
    blocks.push({ t: "pre", text: (pre as string).trim() });
  return blocks.slice(0, MAX_BLOCKS);
}

/** Merge neighboring runs with the same style and trim the edges of a block. */
function tidy(runs: RichInline[]): RichInline[] {
  const out: RichInline[] = [];
  for (const run of runs) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.b === run.b &&
      prev.i === run.i &&
      prev.code === run.code &&
      prev.href === run.href
    )
      prev.text += run.text;
    else out.push({ ...run });
  }
  // Collapse spaces around line breaks and trim the block.
  for (const run of out) run.text = run.text.replace(/ *\n */g, "\n");
  const first = out[0];
  if (first) first.text = first.text.replace(/^[\s]+/, "");
  const last = out[out.length - 1];
  if (last) last.text = last.text.replace(/[\s]+$/, "");
  return out
    .filter((r) => r.text !== "")
    .map((r) => (r.href === "" ? { ...r, href: undefined } : r));
}

/** Plain text of some blocks (search, previews). */
export function blocksToText(blocks: RichBlock[]): string {
  const line = (runs: RichInline[]) => runs.map((r) => r.text).join("");
  return blocks
    .map((b) =>
      b.t === "list"
        ? b.items.map((i) => `• ${line(i)}`).join("\n")
        : b.t === "pre"
          ? b.text
          : b.t === "hr" || b.t === "img"
            ? ""
            : line(b.c),
    )
    .filter(Boolean)
    .join("\n\n");
}
