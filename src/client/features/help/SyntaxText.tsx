/**
 * A prompt shown with the prompt editor's colors, without an editor: the Help view's examples.
 * Uses the same tokenizer (shared/prompt/tokenize) and the syntax tokens.
 */
import { cn } from "@client/lib/cn";
import { type Token, tokenizePrompt } from "@shared/prompt/tokenize";
import { type ReactNode, useMemo } from "react";

const CLASS: Record<Token["type"], string> = {
  paren: "font-semibold text-fg-3",
  bracket: "font-semibold text-cyan-ink",
  weight: "font-mono text-syn-weight",
  lora: "rounded-xs bg-purple/14 text-syn-lora",
  "lora-name": "font-semibold",
  "lora-strength": "font-mono text-syn-weight",
  wildcard: "rounded-xs bg-cyan/13 text-syn-wildcard",
  choice: "font-bold text-syn-wildcard",
  break: "font-mono font-bold tracking-wider text-syn-break",
  escape: "text-syn-escape",
  invalid:
    "rounded-xs bg-red/14 underline decoration-syn-invalid decoration-wavy underline-offset-3",
};

export function SyntaxText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => {
    // Flatten nested tokens (a LoRA holds its name and strength) into styled runs.
    const tokens = tokenizePrompt(text);
    const classes: string[][] = Array.from({ length: text.length }, () => []);
    for (const t of tokens)
      for (let i = t.from; i < t.to && i < text.length; i++) classes[i]?.push(CLASS[t.type]);
    const out: ReactNode[] = [];
    let start = 0;
    const key = (i: number) => (classes[i] ?? []).join(" ");
    for (let i = 1; i <= text.length; i++) {
      if (i === text.length || key(i) !== key(start)) {
        const cls = key(start);
        const chunk = text.slice(start, i);
        out.push(
          cls ? (
            <span key={start} className={cls}>
              {chunk}
            </span>
          ) : (
            chunk
          ),
        );
        start = i;
      }
    }
    return out;
  }, [text]);
  return (
    <code className={cn("font-sans text-sm text-fg whitespace-pre-wrap", className)}>{parts}</code>
  );
}
