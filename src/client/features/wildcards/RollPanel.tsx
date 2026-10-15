/**
 * Roll: sample what a wildcard (or any prompt with wildcards and {a|b} choices) expands to,
 * with the same expansion Generate uses. Unsaved edits to the open file are rolled too.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { Button, CopyButton, NumberField, TextField } from "@client/ui";
import type { RollResult } from "@shared/wildcards";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function RollPanel({
  defaultText,
  overrides,
}: {
  /** What to roll when the panel opens for a file ("__outfits/fantasy__"). */
  defaultText: string;
  /** The open file's unsaved options, by wildcard name. */
  overrides: Record<string, string[]>;
}) {
  const [text, setText] = useState(defaultText);
  const [count, setCount] = useState(8);
  useEffect(() => setText(defaultText), [defaultText]);
  const roll = useMutation({
    mutationFn: () => api.rollWildcards({ text, count, overrides }),
  });
  const result: RollResult | undefined = roll.data;

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex flex-col gap-2 border-b border-line p-3">
        <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
          <Icon name="dice" size={15} className="text-accent-ink" />
          Roll preview
        </span>
        <TextField
          value={text}
          mono
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && text.trim() && roll.mutate()}
          placeholder="__name__ or a whole prompt"
          aria-label="Text to roll"
        />
        <div className="flex items-center gap-2">
          <NumberField
            value={count}
            onChange={setCount}
            min={1}
            max={50}
            step={1}
            size="sm"
            label="Rolls"
            className="w-24"
          />
          <Button
            variant="primary"
            icon="dice"
            className="ml-auto"
            loading={roll.isPending}
            disabled={!text.trim()}
            onClick={() => roll.mutate()}
          >
            Roll
          </Button>
        </div>
      </div>
      <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3">
        {roll.error ? <p className="text-sm text-danger">{roll.error.message}</p> : null}
        {!result && !roll.error ? (
          <p className="text-xs text-fg-3">
            Roll to see random picks. The same seed always gives the same pick, like in Generate.
          </p>
        ) : null}
        {result?.rolls[0]?.missing.length ? (
          <p className="flex items-start gap-1.5 rounded-md border border-yellow/30 bg-yellow/10 px-2.5 py-2 text-xs text-warning">
            <Icon name="errors" size={13} className="mt-px shrink-0" />
            Not found: {result.rolls[0].missing.map((m) => `__${m}__`).join(", ")}
          </p>
        ) : null}
        {result?.rolls.map((r) => (
          <div
            key={r.seed}
            className="group flex items-start gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-2"
          >
            <span className="min-w-0 flex-1 text-sm break-words whitespace-pre-wrap text-fg">
              {r.text}
            </span>
            <span className="flex flex-col items-end gap-0.5">
              <CopyButton
                text={r.text}
                label="Copy this roll"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              />
              <span className="font-mono text-[10px] text-fg-4" title="Seed">
                {r.seed}
              </span>
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}
