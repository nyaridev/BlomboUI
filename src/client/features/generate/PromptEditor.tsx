/**
 * Prompt editor on CodeMirror 6. Highlighting comes from the shared tokenizer (weights, LoRAs,
 * wildcards, BREAK, escapes, and errors with a hover message). Decorations instead of an overlay
 * mirror, so long prompts stay fast.
 */

import { cn } from "@client/lib/cn";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import {
  placeholder as cmPlaceholder,
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { type Token, tokenizePrompt } from "@shared/prompt/tokenize";
import { useEffect, useRef } from "react";

function className(t: Token): string {
  switch (t.type) {
    case "paren":
      return `cm-p-paren cm-p-d${Math.min(t.depth ?? 1, 3)}`;
    case "bracket":
      return "cm-p-bracket";
    case "weight":
      return "cm-p-weight";
    case "lora":
      return "cm-p-lora";
    case "lora-name":
      return "cm-p-lora-name";
    case "lora-strength":
      return "cm-p-lora-strength";
    case "wildcard":
      return "cm-p-wildcard";
    case "break":
      return "cm-p-break";
    case "escape":
      return "cm-p-escape";
    case "invalid":
      return "cm-p-invalid";
  }
}

function decorate(state: EditorState): DecorationSet {
  const ranges = tokenizePrompt(state.doc.toString())
    .filter((t) => t.to > t.from)
    .map((t) =>
      Decoration.mark({
        class: className(t),
        attributes: t.message ? { title: t.message } : undefined,
      }).range(t.from, t.to),
    );
  return Decoration.set(ranges, true);
}

const promptHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorate(view.state);
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.decorations = decorate(u.state);
    }
  },
  { decorations: (v) => v.decorations },
);

const theme = EditorView.theme({
  "&": { fontSize: "13.5px", color: "var(--fg)", backgroundColor: "transparent", height: "100%" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-sans)", lineHeight: "1.65", overflow: "auto" },
  ".cm-content": { padding: "10px 0", caretColor: "var(--accent-ink)" },
  ".cm-line": { padding: "0 12px" },
  ".cm-cursor": { borderLeftColor: "var(--accent-ink)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklab, var(--accent) 35%, transparent) !important",
  },
  ".cm-placeholder": { color: "var(--fg-4)" },
  ".cm-p-paren": { color: "var(--fg-3)", fontWeight: "600" },
  ".cm-p-d2": { color: "var(--fg-2)" },
  ".cm-p-d3": { color: "var(--syn-weight)" },
  ".cm-p-bracket": { color: "var(--cyan-ink)", fontWeight: "600" },
  ".cm-p-weight": {
    color: "var(--syn-weight)",
    fontFamily: "var(--font-mono)",
    fontSize: "12.5px",
  },
  ".cm-p-lora": {
    color: "var(--syn-lora)",
    backgroundColor: "color-mix(in oklab, var(--purple) 14%, transparent)",
    borderRadius: "4px",
    padding: "1px 0",
    boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--purple-ink) 25%, transparent)",
  },
  ".cm-p-lora-name": { fontWeight: "600" },
  ".cm-p-lora-strength": {
    fontFamily: "var(--font-mono)",
    fontSize: "12.5px",
    color: "var(--syn-weight)",
  },
  ".cm-p-wildcard": {
    color: "var(--syn-wildcard)",
    backgroundColor: "color-mix(in oklab, var(--cyan) 13%, transparent)",
    borderRadius: "4px",
    padding: "1px 0",
  },
  ".cm-p-break": {
    color: "var(--syn-break)",
    fontWeight: "700",
    letterSpacing: "0.06em",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
  },
  ".cm-p-escape": { color: "var(--syn-escape)" },
  ".cm-p-invalid": {
    textDecoration: "underline wavy var(--syn-invalid)",
    textUnderlineOffset: "3px",
    backgroundColor: "color-mix(in oklab, var(--red) 14%, transparent)",
    borderRadius: "3px",
  },
});

export function PromptEditor({
  value,
  onChange,
  placeholder,
  minRows = 3,
  className,
  label,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  className?: string;
  label: string;
  onSubmit?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  onChangeRef.current = onChange;
  onSubmitRef.current = onSubmit;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor is created once; value syncs below
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                onSubmitRef.current?.();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "false" }),
          cmPlaceholder(placeholder ?? ""),
          promptHighlight,
          theme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current !== value) v.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return (
    <div
      ref={host}
      className={cn(
        "min-h-0 resize-y overflow-hidden rounded-md border border-line bg-field transition-[border-color,box-shadow]",
        "hover:border-line-strong focus-within:border-accent-ink/60 focus-within:ring-2 focus-within:ring-accent/20",
        className,
      )}
      style={{ minHeight: `${minRows * 22 + 20}px` }}
    />
  );
}
