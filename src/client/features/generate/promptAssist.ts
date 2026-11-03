/**
 * Prompt editor helpers on CodeMirror: autocomplete (tags, LoRAs and their trigger words,
 * wildcards, frequent tags; suggestions come from the server, shared/autocomplete.ts decides
 * what's being typed) and Ctrl+↑/↓ to change the weight under the cursor (shared/prompt/weight).
 * Settings are read through a getter, so changing them doesn't rebuild the editor.
 */
import { api } from "@client/lib/api";
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  completionKeymap,
  selectedCompletionIndex,
  setSelectedCompletion,
  startCompletion,
} from "@codemirror/autocomplete";
import { type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap, type Rect, ViewPlugin } from "@codemirror/view";
import { completeContext, formatTag, type Suggestion } from "@shared/autocomplete";
import { nudgeWeight } from "@shared/prompt/weight";
import type { AutocompleteSettings } from "@shared/settings";

export interface AssistSettings {
  autocomplete: AutocompleteSettings;
  blurNsfw: boolean;
}

/** Booru tag categories → palette tokens for the little dot. */
/** How many suggestions come back (the most the server gives); the list scrolls through them. */
const SUGGESTIONS = 50;

const CATEGORY_COLOR: Record<number, string> = {
  0: "var(--blue-ink)",
  1: "var(--red-ink)",
  3: "var(--purple-ink)",
  4: "var(--green-ink)",
  5: "var(--orange-ink)",
};

const CATEGORY_NAME: Record<number, string> = {
  0: "General",
  1: "Artist",
  3: "Copyright",
  4: "Character",
  5: "Meta",
};

interface SuggestionCompletion extends Completion {
  suggestion: Suggestion;
}

function insertText(s: Suggestion, ac: AutocompleteSettings, after: string): string {
  let text = s.kind === "tag" || s.kind === "trigger" ? formatTag(s.text, ac) : s.text;
  if (s.kind === "lora" && ac.insertTriggers && s.triggers?.length)
    text += `, ${s.triggers.join(", ")}`;
  // A comma after the tag, unless one is already there.
  if (ac.appendComma && !/^\s*,/.test(after)) text += ", ";
  return text;
}

function source(get: () => AssistSettings | null) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const s = get();
    if (!s?.autocomplete.enabled) return null;
    const ac = s.autocomplete;
    const c = completeContext(ctx.state.sliceDoc(0, ctx.pos), ctx.pos);
    if (!c) return null;
    if (c.mode === "tag" && c.query.trim().length < ac.minChars && !ctx.explicit) return null;
    if (
      c.mode === "wildcard" &&
      !c.query &&
      !ctx.explicit &&
      !ctx.state.sliceDoc(c.from, ctx.pos).endsWith("__")
    )
      return null;
    const controller = new AbortController();
    ctx.addEventListener("abort", () => controller.abort());
    // The list shows `rows` of them and scrolls one row at a time through the rest.
    ctx.view?.dom.style.setProperty("--ac-rows", String(ac.rows));
    const list = await api
      .suggest(c.query.trim(), c.mode, SUGGESTIONS, controller.signal)
      .catch(() => [] as Suggestion[]);
    if (controller.signal.aborted || !list.length) return null;
    const options: SuggestionCompletion[] = list.map((sug, i) => ({
      // Tags read the way they'll be inserted ("long hair", not "long_hair").
      label:
        sug.kind === "tag" && ac.replaceUnderscores
          ? formatTag(sug.label, { replaceUnderscores: true, escapeParens: false })
          : sug.label,
      // A tag you use often gets a star (renderStar) instead of "used 4×".
      detail: sug.uses !== null ? undefined : (sug.detail ?? undefined),
      type: sug.kind,
      // The picture shows big beside the list, for the selected entry only.
      info: sug.thumb && ac.thumbnails ? () => picture(sug, s.blurNsfw) : undefined,
      boost: -i,
      suggestion: sug,
      apply: (view, _completion, from, to) => {
        const after = view.state.sliceDoc(to, to + 3);
        const text = insertText(sug, ac, after);
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
          userEvent: "input.complete",
        });
      },
    }));
    // The server already ranked them; keep its order while typing narrows the list.
    return { from: c.from, to: ctx.pos, options, filter: false };
  };
}

function picture(sug: Suggestion, blurNsfw: boolean): Node {
  const img = document.createElement("img");
  img.src = sug.thumb ?? "";
  img.alt = "";
  img.className = `cm-ac-picture${sug.nsfw && blurNsfw ? " cm-ac-blur" : ""}`;
  return img;
}

function renderMark(completion: Completion): Node | null {
  const sug = (completion as SuggestionCompletion).suggestion;
  if (!sug) return null;
  const dot = document.createElement("span");
  dot.className = "cm-ac-mark";
  if (sug.kind === "tag") {
    dot.textContent = "●";
    dot.title = sug.category !== null ? (CATEGORY_NAME[sug.category] ?? "Tag") : "Your tag";
    dot.style.color =
      sug.category !== null ? (CATEGORY_COLOR[sug.category] ?? "var(--fg-3)") : "var(--fg-4)";
  } else {
    dot.textContent = sug.kind === "wildcard" ? "__" : sug.kind === "lora" ? "◆" : "✦";
    dot.style.color = sug.kind === "wildcard" ? "var(--syn-wildcard)" : "var(--syn-lora)";
  }
  return dot;
}

function renderStar(completion: Completion): Node | null {
  const uses = (completion as SuggestionCompletion).suggestion?.uses;
  if (uses == null) return null;
  const star = document.createElement("span");
  star.className = "cm-ac-star";
  star.textContent = "★";
  star.title = `You used this ${uses}×`;
  return star;
}

function weightKey(get: () => AssistSettings | null, dir: 1 | -1) {
  return (view: EditorView): boolean => {
    const step = get()?.autocomplete.weightStep ?? 0.05;
    const sel = view.state.selection.main;
    const edit = nudgeWeight(view.state.doc.toString(), sel.from, sel.to, dir * step);
    if (!edit) return true;
    const doc = view.state.doc.toString();
    // Replace only the changed span so undo and decorations stay small.
    let start = 0;
    while (start < doc.length && start < edit.text.length && doc[start] === edit.text[start])
      start++;
    let endOld = doc.length;
    let endNew = edit.text.length;
    while (endOld > start && endNew > start && doc[endOld - 1] === edit.text[endNew - 1]) {
      endOld--;
      endNew--;
    }
    view.dispatch({
      changes: { from: start, to: endOld, insert: edit.text.slice(start, endNew) },
      selection: { anchor: edit.from, head: edit.to },
      userEvent: "input.weight",
    });
    return true;
  };
}

export const assistTheme = EditorView.theme({
  ".cm-tooltip": {
    backgroundColor: "var(--surface-3)",
    border: "1px solid var(--line-strong)",
    borderRadius: "8px",
    color: "var(--fg)",
    boxShadow: "var(--shadow-pop)",
    overflow: "hidden",
  },
  // The picture panel sits outside the list's box, so this one can't clip.
  ".cm-tooltip.cm-tooltip-autocomplete": { overflow: "visible" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    borderRadius: "8px",
    fontFamily: "var(--font-ui)",
    // Rows are 32px (24 line + 8 padding), plus the list's own 8px padding.
    maxHeight: "calc(var(--ac-rows, 8) * 32px + 8px)",
    minWidth: "300px",
    padding: "4px",
  },
  // Both classes, so these win over CodeMirror's own row styles.
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "4px 10px 4px 6px",
    borderRadius: "5px",
    lineHeight: "24px",
    color: "var(--fg-2)",
  },
  // The command palette's active row: a fill that shows on every surface and theme.
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "color-mix(in srgb, var(--fg) 8%, transparent)",
    color: "var(--fg)",
  },
  ".cm-completionLabel": { fontSize: "14px", flex: "1", minWidth: "0" },
  ".cm-completionDetail": {
    color: "var(--fg-3)",
    fontStyle: "normal",
    fontSize: "12px",
    fontFamily: "var(--font-mono)",
    marginLeft: "12px",
  },
  ".cm-completionMatchedText": { textDecoration: "none", color: "var(--accent-ink)" },
  ".cm-ac-mark": {
    display: "inline-grid",
    placeItems: "center",
    width: "20px",
    fontSize: "10px",
    flexShrink: "0",
  },
  ".cm-ac-star": {
    marginLeft: "12px",
    fontSize: "13px",
    color: "var(--generate-ink)",
    flexShrink: "0",
  },
  // The selected entry's picture, beside the list (CodeMirror's info panel).
  ".cm-tooltip.cm-completionInfo": { padding: "4px", maxWidth: "none" },
  ".cm-ac-picture": {
    display: "block",
    width: "200px",
    height: "260px",
    borderRadius: "5px",
    objectFit: "cover",
    backgroundColor: "var(--sunken)",
  },
  ".cm-ac-blur": { filter: "blur(12px)" },
});

/**
 * The picture goes beside the list, level with the selected row; when neither side has room
 * (phones), under the whole list, so it never covers the rows below the selected one.
 */
function positionPicture(
  _view: EditorView,
  list: Rect,
  option: Rect,
  info: Rect,
  space: Rect,
): { style?: string; class?: string } {
  const width = info.right - info.left;
  const height = info.bottom - info.top;
  const top = Math.max(0, Math.min(option.top - list.top, space.bottom - list.top - height));
  if (space.right - list.right >= width)
    return { style: `top: ${top}px`, class: "cm-completionInfo-right" };
  if (list.left - space.left >= width)
    return { style: `top: ${top}px`, class: "cm-completionInfo-left" };
  return { style: `top: ${list.bottom - list.top + 4}px; left: 0` };
}

/** The row under the mouse becomes the selected one (as in the command palette), so its picture shows. */
const hoverSelects = ViewPlugin.define((view) => {
  let last = "";
  const onMove = (e: MouseEvent) => {
    // Chromium sends a mousemove when the list scrolls under a still pointer; only a real move
    // selects, or ↓ at the bottom row would snap back to the row under the mouse.
    const at = `${e.screenX},${e.screenY}`;
    if (at === last) return;
    last = at;
    const li = (e.target as Element).closest?.(".cm-tooltip-autocomplete li[role=option]");
    const i = Number(li?.id.slice(li.id.lastIndexOf("-") + 1));
    if (li && Number.isInteger(i) && i !== selectedCompletionIndex(view.state))
      view.dispatch({ effects: setSelectedCompletion(i) });
  };
  view.dom.addEventListener("mousemove", onMove);
  return { destroy: () => view.dom.removeEventListener("mousemove", onMove) };
});

/** Autocomplete, its look, and the weight keys. */
export function promptAssist(get: () => AssistSettings | null): Extension[] {
  return [
    autocompletion({
      override: [source(get)],
      icons: false,
      activateOnTyping: true,
      maxRenderedOptions: SUGGESTIONS,
      positionInfo: positionPicture,
      addToOptions: [
        { render: renderMark, position: 20 },
        { render: renderStar, position: 90 },
      ],
    }),
    Prec.high(
      keymap.of([
        ...completionKeymap,
        { key: "Mod-ArrowUp", run: weightKey(get, 1), preventDefault: true },
        { key: "Mod-ArrowDown", run: weightKey(get, -1), preventDefault: true },
        { key: "Mod-Space", run: startCompletion },
      ]),
    ),
    hoverSelects,
    assistTheme,
  ];
}
