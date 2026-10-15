/** Prompt editors and the Generate / Interrupt / Cancel stack beside them. */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useLive } from "@client/lib/live";
import { bouncy } from "@client/lib/motion";
import { IconButton, Kbd, NumberField, Switch, Tooltip } from "@client/ui";
import { estimateTokens } from "@shared/prompt/tokenize";
import { motion } from "motion/react";
import { useMemo } from "react";
import { cancelAll, generate, interrupt, setLoop, useLoopIntent } from "../actions";
import { PromptEditor } from "../PromptEditor";
import { useValue, useValues } from "../state";
import { useRoleBinding } from "../workflow";

function TokenCount({ text }: { text: string }) {
  const { tokens, chunks } = useMemo(() => estimateTokens(text), [text]);
  const over = tokens > chunks * 75;
  return (
    <span className={cn("font-mono text-2xs tabular", over ? "text-warning" : "text-fg-3")}>
      {tokens} tok · {chunks} chunk{chunks === 1 ? "" : "s"}
    </span>
  );
}

function PromptField({
  id,
  label,
  placeholder,
  minRows,
  className,
  tools,
}: {
  id: string;
  label: string;
  placeholder: string;
  minRows: number;
  className: string;
  tools?: boolean;
}) {
  const [value, setValue] = useValue<string>(id);
  const text = typeof value === "string" ? value : "";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-0.5">
        <span className="text-xs font-medium text-fg-2">{label}</span>
        <TokenCount text={text} />
        {tools ? (
          <span className="ml-auto flex items-center">
            <IconButton
              icon="eraser"
              label={`Clear ${label.toLowerCase()}`}
              size="xs"
              onClick={() => setValue("")}
            />
          </span>
        ) : null}
      </div>
      <PromptEditor
        label={label}
        value={text}
        onChange={setValue}
        minRows={minRows}
        placeholder={placeholder}
        onSubmit={() => void generate()}
        className={className}
      />
    </div>
  );
}

export function Prompts() {
  const positive = useRoleBinding("prompt.positive");
  const negative = useRoleBinding("prompt.negative");
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {positive ? (
        <PromptField
          id={positive.id}
          label={positive.label === "Prompt" ? "Prompt" : positive.label}
          placeholder="Describe the image. Ctrl+Enter generates."
          minRows={3}
          className="h-[118px]"
          tools
        />
      ) : (
        <div className="grid h-[140px] place-items-center rounded-md border border-dashed border-line px-4 text-center text-xs text-fg-3">
          This workflow has no prompt. Its settings are below; Generate runs it as it is.
        </div>
      )}
      {negative ? (
        <PromptField
          id={negative.id}
          label="Negative"
          placeholder="What to avoid"
          minRows={1}
          className="h-[64px]"
        />
      ) : null}
    </div>
  );
}

export function GenerateActions() {
  const running = useLive((s) => s.queue.jobs.some((j) => j.state === "running"));
  const queued = useLive((s) => s.queue.jobs.filter((j) => j.state === "queued").length);
  const serverLoop = useLive((s) => s.queue.loop);
  const progress = useLive((s) => s.progress?.progress.overall ?? 0);
  const ready = useValues((s) => s.workflowId !== null);
  const count = useValues((s) => s.run.count);
  const setRun = useValues((s) => s.setRun);
  const loopIntent = useLoopIntent((s) => s.on);
  const busy = running || queued > 0;
  const loop = serverLoop || loopIntent;

  return (
    <div className="flex w-[232px] shrink-0 flex-col gap-2">
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        transition={bouncy}
        disabled={!ready}
        onClick={() => void generate()}
        className={cn(
          "group relative flex h-[92px] flex-col items-center justify-center gap-1 overflow-hidden rounded-xl text-on-generate focus-ring disabled:opacity-50",
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
          <Icon name={busy ? "plus" : "sparkle"} size={20} strokeWidth={2} />
          {busy ? "Add to queue" : "Generate"}
        </span>
        <span className="relative flex items-center gap-1.5 text-xs text-white/80">
          {busy ? (
            <span className="tabular">
              {Math.round(progress * 100)}% · {queued} queued
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
        <Tooltip content="Stop this image; queued runs continue">
          <button
            type="button"
            disabled={!running}
            onClick={() => void interrupt()}
            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-line bg-field text-sm text-fg-2 transition-colors hover:border-line-strong hover:text-fg disabled:opacity-40 focus-ring"
          >
            <Icon name="skip" size={15} /> Interrupt
          </button>
        </Tooltip>
        <Tooltip content="Stop and clear the queue">
          <button
            type="button"
            disabled={!busy && !serverLoop}
            onClick={() => void cancelAll()}
            className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-red/30 bg-red/10 text-sm text-red-ink transition-colors hover:bg-red/20 disabled:opacity-40 focus-ring"
          >
            <Icon name="stop" size={14} /> Cancel
          </button>
        </Tooltip>
      </div>
      <div className="flex items-center gap-2">
        <NumberField
          value={count}
          onChange={(n) => setRun({ count: n })}
          min={1}
          max={100}
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
            onCheckedChange={(on) => void setLoop(on, serverLoop)}
            label="Generate forever"
            tone="generate"
          />
        </span>
      </div>
    </div>
  );
}
