/**
 * The wildcard file editor (CodeMirror 6). YAML files get syntax colors, folding, a linter
 * (parse errors, and references to wildcards that don't exist) and the outline of keys; both
 * formats highlight `__references__` and complete them as you type `__`. Ctrl+S saves.
 *
 * CodeMirror owns the text: the parent hears about changes but never pushes text back while
 * typing, only when another file is opened.
 */
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { type Diagnostic, linter, lintGutter } from "@codemirror/lint";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import type { WildcardFormat } from "@shared/wildcards";
import { useEffect, useRef } from "react";
import { parseDocument } from "yaml";

const REF = /__([^\s_][^\s]*?)__/g;

const refMatcher = new MatchDecorator({
  regexp: REF,
  decoration: () => Decoration.mark({ class: "cm-wc-ref" }),
});
const refHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = refMatcher.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = refMatcher.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

const highlight = HighlightStyle.define([
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "var(--accent-ink)" },
  { tag: [t.string, t.special(t.string)], color: "var(--fg)" },
  { tag: [t.comment, t.lineComment], color: "var(--fg-4)", fontStyle: "italic" },
  { tag: [t.number, t.bool, t.null], color: "var(--syn-weight)" },
  { tag: [t.punctuation, t.separator, t.squareBracket, t.brace], color: "var(--fg-3)" },
  { tag: [t.keyword, t.typeName, t.labelName], color: "var(--syn-lora)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", color: "var(--fg)", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6", overflow: "auto" },
  ".cm-content": { padding: "10px 0", caretColor: "var(--accent-ink)" },
  ".cm-line": { padding: "0 14px 0 6px" },
  ".cm-cursor": { borderLeftColor: "var(--accent-ink)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklab, var(--accent) 32%, transparent) !important",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--fg-4)",
    border: "none",
    borderRight: "1px solid var(--line)",
  },
  ".cm-activeLineGutter": { backgroundColor: "var(--surface-2)", color: "var(--fg-2)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklab, var(--field) 55%, transparent)" },
  ".cm-foldGutter .cm-gutterElement": { padding: "0 4px", cursor: "pointer" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--field)",
    border: "1px solid var(--line-strong)",
    color: "var(--fg-3)",
    borderRadius: "4px",
    padding: "0 4px",
  },
  ".cm-wc-ref": { color: "var(--syn-wildcard)" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface-3)",
    border: "1px solid var(--line-strong)",
    borderRadius: "8px",
    color: "var(--fg)",
    boxShadow: "var(--shadow-pop)",
  },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 10px", fontFamily: "var(--font-mono)" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--field)",
    color: "var(--fg)",
  },
  ".cm-completionDetail": { color: "var(--fg-3)", fontStyle: "normal", marginLeft: "8px" },
  ".cm-diagnostic": { padding: "4px 8px", fontFamily: "var(--font-ui)", fontSize: "12px" },
  ".cm-diagnostic-error": { borderLeft: "3px solid var(--danger)" },
  ".cm-diagnostic-warning": { borderLeft: "3px solid var(--warning)" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--danger)",
    textUnderlineOffset: "3px",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--warning)",
    textUnderlineOffset: "3px",
  },
  ".cm-lint-marker": { width: "0.8em", height: "0.8em" },
});

/** Problems in a wildcard file: YAML errors and references nothing defines. Exported for tests. */
export function lintWildcards(
  text: string,
  format: WildcardFormat,
  known: ReadonlySet<string>,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (format === "yaml") {
    const doc = parseDocument(text, { prettyErrors: false });
    for (const e of doc.errors)
      out.push({
        from: Math.min(e.pos[0], text.length),
        to: Math.min(Math.max(e.pos[1], e.pos[0] + 1), text.length),
        severity: "error",
        message: e.message.split("\n")[0] ?? "Invalid YAML",
      });
    for (const w of doc.warnings)
      out.push({
        from: Math.min(w.pos[0], text.length),
        to: Math.min(Math.max(w.pos[1], w.pos[0] + 1), text.length),
        severity: "warning",
        message: w.message.split("\n")[0] ?? "",
      });
  }
  if (known.size)
    for (const m of text.matchAll(REF)) {
      const name = m[1] ?? "";
      // Lines in comments don't count.
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      if (text.slice(lineStart, m.index).trimStart().startsWith("#")) continue;
      if (!known.has(name))
        out.push({
          from: m.index,
          to: m.index + m[0].length,
          severity: "warning",
          message: `No wildcard named "${name}". Create ${name}.txt, or add the key to a YAML file.`,
        });
    }
  return out;
}

export function WildcardEditor({
  docKey,
  text,
  format,
  names,
  onChange,
  onSave,
  className,
}: {
  /** Changes when another file opens; the editor reloads its text then. */
  docKey: string;
  text: string;
  format: WildcardFormat;
  /** Every wildcard name (for completion and the unknown-reference lint). */
  names: string[];
  onChange: (text: string) => void;
  onSave: () => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const known = useRef(new Set(names));
  const callbacks = useRef({ onChange, onSave });
  callbacks.current = { onChange, onSave };
  const language = useRef(new Compartment());
  known.current = new Set(names);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor is rebuilt only per file
  useEffect(() => {
    if (!host.current) return;
    const complete = (ctx: CompletionContext) => {
      const word = ctx.matchBefore(/__[^\s_]*(?:_[^\s_]+)*$/);
      if (!word || (word.from === word.to && !ctx.explicit)) return null;
      const options: Completion[] = [...known.current].map((n) => ({
        label: `__${n}__`,
        type: "variable",
        detail: n.includes("/") ? n.slice(0, n.lastIndexOf("/")) : undefined,
      }));
      return { from: word.from, options, validFor: /^__[^\s]*$/ };
    };
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter({
        markerDOM: (open) => {
          const el = document.createElement("span");
          el.textContent = open ? "▾" : "▸";
          return el;
        },
      }),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      autocompletion({ override: [complete], icons: false }),
      language.current.of(format === "yaml" ? yaml() : []),
      syntaxHighlighting(highlight),
      refHighlight,
      lintGutter(),
      linter((v) => lintWildcards(v.state.doc.toString(), format, known.current), { delay: 350 }),
      keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            callbacks.current.onSave();
            return true;
          },
        },
        indentWithTab,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
      ]),
      EditorState.tabSize.of(2),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) callbacks.current.onChange(u.state.doc.toString());
      }),
      EditorView.contentAttributes.of({ "aria-label": "Wildcard file text", spellcheck: "false" }),
      theme,
    ];
    const v = new EditorView({
      state: EditorState.create({ doc: text, extensions }),
      parent: host.current,
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, [docKey, format]);

  return <div ref={host} className={className} />;
}
