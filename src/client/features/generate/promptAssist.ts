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
  startCompletion,
} from "@codemirror/autocomplete";
import { type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { completeContext, formatTag, type Suggestion } from "@shared/autocomplete";
import { nudgeWeight } from "@shared/prompt/weight";
import type { AutocompleteSettings } from "@shared/settings";

export interface AssistSettings {
  autocomplete: AutocompleteSettings;
  blurNsfw: boolean;
}

/** Booru tag categories → palette tokens for the little dot. */
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
    const list = await api
      .suggest(c.query.trim(), c.mode, ac.maxResults, controller.signal)
      .catch(() => [] as Suggestion[]);
    if (controller.signal.aborted || !list.length) return null;
    const options: SuggestionCompletion[] = list.map((sug, i) => ({
      // Tags read the way they'll be inserted ("long hair", not "long_hair").
      label:
        sug.kind === "tag" && ac.replaceUnderscores
          ? formatTag(sug.label, { replaceUnderscores: true, escapeParens: false })
          : sug.label,
      detail: sug.detail ?? undefined,
      type: sug.kind,
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

function renderMark(get: () => AssistSettings | null) {
  return (completion: Completion): Node | null => {
    const sug = (completion as SuggestionCompletion).suggestion;
    const s = get();
    if (!sug) return null;
    if (sug.thumb && s?.autocomplete.thumbnails) {
      const img = document.createElement("img");
      img.src = sug.thumb;
      img.alt = "";
      img.loading = "lazy";
      img.className = `cm-ac-thumb${sug.nsfw && s.blurNsfw ? " cm-ac-blur" : ""}`;
      return img;
    }
    const dot = document.createElement("span");
    dot.className = "cm-ac-mark";
    if (sug.kind === "tag" && sug.uses !== null) {
      dot.textContent = "★";
      dot.title = "You use this often";
      dot.style.color = "var(--generate-ink)";
    } else if (sug.kind === "tag" && sug.category !== null) {
      dot.textContent = "●";
      dot.title = CATEGORY_NAME[sug.category] ?? "Tag";
      dot.style.color = CATEGORY_COLOR[sug.category] ?? "var(--fg-3)";
    } else {
      dot.textContent = sug.kind === "wildcard" ? "__" : sug.kind === "lora" ? "◆" : "✦";
      dot.style.color = sug.kind === "wildcard" ? "var(--syn-wildcard)" : "var(--syn-lora)";
    }
    return dot;
  };
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
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-ui)",
    maxHeight: "18em",
    minWidth: "260px",
    padding: "4px",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "3px 8px",
    borderRadius: "5px",
    lineHeight: "22px",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--field)",
    color: "var(--fg)",
  },
  ".cm-completionLabel": { fontSize: "13px", flex: "1", minWidth: "0" },
  ".cm-completionDetail": {
    color: "var(--fg-3)",
    fontStyle: "normal",
    fontSize: "11px",
    fontFamily: "var(--font-mono)",
    marginLeft: "12px",
  },
  ".cm-completionMatchedText": { textDecoration: "none", color: "var(--accent-ink)" },
  ".cm-ac-mark": {
    display: "inline-grid",
    placeItems: "center",
    width: "22px",
    fontSize: "10px",
    flexShrink: "0",
  },
  ".cm-ac-thumb": {
    width: "22px",
    height: "22px",
    borderRadius: "4px",
    objectFit: "cover",
    flexShrink: "0",
    backgroundColor: "var(--sunken)",
  },
  ".cm-ac-blur": { filter: "blur(4px)" },
});

/** Autocomplete, its look, and the weight keys. */
export function promptAssist(get: () => AssistSettings | null): Extension[] {
  return [
    autocompletion({
      override: [source(get)],
      icons: false,
      activateOnTyping: true,
      maxRenderedOptions: 50,
      addToOptions: [{ render: renderMark(get), position: 20 }],
    }),
    Prec.high(
      keymap.of([
        ...completionKeymap,
        { key: "Mod-ArrowUp", run: weightKey(get, 1), preventDefault: true },
        { key: "Mod-ArrowDown", run: weightKey(get, -1), preventDefault: true },
        { key: "Mod-Space", run: startCompletion },
      ]),
    ),
    assistTheme,
  ];
}
