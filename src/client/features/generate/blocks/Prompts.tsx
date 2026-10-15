/** Prompt editors and the Generate / Interrupt / Cancel stack beside them. */
import { useSystemPreview } from "@client/features/preview/systemPreview";
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { bouncy } from "@client/lib/motion";
import { IconButton, Kbd, NumberField, Switch, Tooltip, toast } from "@client/ui";
import { estimateTokens } from "@shared/prompt/tokenize";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { PromptEditor } from "../PromptEditor";
import { useValues } from "../state";

export function startPreviewRun() {
  const s = useSystemPreview.getState();
  if (s.running) s.set({ queue: s.queue + 1 });
  else s.set({ running: true, progress: 0 });
}

function TokenCount({ text }: { text: string }) {
  const { tokens, chunks } = useMemo(() => estimateTokens(text), [text]);
  const over = tokens > chunks * 75;
  return (
    <span className={cn("font-mono text-2xs tabular", over ? "text-warning" : "text-fg-3")}>
      {tokens} tok · {chunks} chunk{chunks === 1 ? "" : "s"}
    </span>
  );
}

export function Prompts() {
  const prompt = useValues((s) => s.prompt);
  const negative = useValues((s) => s.negative);
  const setPrompt = useValues((s) => s.setPrompt);
  const setNegative = useValues((s) => s.setNegative);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-xs font-medium text-fg-2">Prompt</span>
          <TokenCount text={prompt} />
          <span className="ml-auto flex items-center">
            <IconButton icon="history" label="Prompt history" size="xs" />
            <IconButton icon="tag" label="Snippets" size="xs" />
            <IconButton
              icon="eraser"
              label="Clear prompt"
              size="xs"
              onClick={() => setPrompt("")}
            />
          </span>
        </div>
        <PromptEditor
          label="Prompt"
          value={prompt}
          onChange={setPrompt}
          minRows={3}
          placeholder="Describe the image. Ctrl+Enter generates."
          onSubmit={startPreviewRun}
          className="h-[118px]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-xs font-medium text-fg-2">Negative</span>
          <TokenCount text={negative} />
        </div>
        <PromptEditor
          label="Negative prompt"
          value={negative}
          onChange={setNegative}
          minRows={1}
          placeholder="What to avoid"
          onSubmit={startPreviewRun}
          className="h-[64px]"
        />
      </div>
    </div>
  );
}

export function GenerateActions() {
  const running = useSystemPreview((s) => s.running);
  const progress = useSystemPreview((s) => s.progress);
  const queue = useSystemPreview((s) => s.queue);
  const set = useSystemPreview((s) => s.set);
  const [count, setCount] = useState(1);
  const [loop, setLoop] = useState(false);

  return (
    <div className="flex w-[232px] shrink-0 flex-col gap-2">
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        transition={bouncy}
        onClick={startPreviewRun}
        className={cn(
          "group relative flex h-[92px] flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-on-generate focus-ring",
          "bg-[linear-gradient(180deg,var(--generate-hi),var(--generate))] shadow-[inset_0_1px_0_rgb(255_255_255/.28),inset_0_-2px_0_rgb(0_0_0/.15)]",
          "transition-[box-shadow,filter] duration-200 hover:shadow-glow hover:brightness-105",
        )}
      >
        {running ? (
          <span
            className="absolute inset-y-0 left-0 bg-white/18 transition-[width] duration-500 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        ) : null}
        <span className="relative flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Icon name={running ? "plus" : "sparkle"} size={20} strokeWidth={2} />
          {running ? "Add to queue" : "Generate"}
        </span>
        <span className="relative flex items-center gap-1.5 text-xs text-white/80">
          {running ? (
            <span className="tabular">
              {Math.round(progress * 100)}% · {queue} queued
            </span>
          ) : (
            <>
              <Kbd className="border-white/30 bg-white/15 text-white">Ctrl</Kbd>
              <Kbd className="border-white/30 bg-white/15 text-white">Enter</Kbd>
            </>
          )}
        </span>
      </motion.button>
      <div className="grid grid-cols-2 gap-1.5">
        <Tooltip content="Finish this image's current stage, skip the rest">
          <button
            type="button"
            disabled={!running}
            onClick={() => {
              set({ progress: 1 });
              toast("Interrupted, saving what's done", "info");
            }}
            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-line bg-field text-sm text-fg-2 transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40 focus-ring"
          >
            <Icon name="skip" size={15} /> Interrupt
          </button>
        </Tooltip>
        <Tooltip content="Stop and clear the queue">
          <button
            type="button"
            disabled={!running}
            onClick={() => {
              set({ running: false, progress: 0, queue: 0 });
              toast("Cancelled the run and cleared the queue", "warning");
            }}
            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-red/30 bg-red/10 text-sm text-red-ink transition-colors hover:bg-red/20 disabled:opacity-40 focus-ring"
          >
            <Icon name="stop" size={14} /> Cancel
          </button>
        </Tooltip>
      </div>
      <div className="flex items-center gap-2">
        <NumberField
          value={count}
          onChange={setCount}
          min={1}
          max={99}
          label="Runs"
          size="sm"
          className="w-[84px]"
          unit="×"
        />
        <span className="text-xs text-fg-3">runs</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-fg-3">
          <Icon name="refresh" size={13} /> Loop
          <Switch
            size="sm"
            checked={loop}
            onCheckedChange={setLoop}
            label="Generate forever"
            tone="generate"
          />
        </span>
      </div>
    </div>
  );
}
