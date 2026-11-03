/** Prompt editors and the Generate / Interrupt / Cancel stack beside them. */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useLive } from "@client/lib/live";
import { bouncy } from "@client/lib/motion";
import { Button, IconButton, Tooltip } from "@client/ui";
import { estimateTokens } from "@shared/prompt/tokenize";
import { motion } from "motion/react";
import { useMemo, useRef } from "react";
import { cancelAll, generate, interrupt } from "../actions";
import { PromptEditor, type PromptEditorHandle } from "../PromptEditor";
import { useValue, useValues } from "../state";
import { useRoleBinding } from "../workflow";
import { PromptHistoryButton } from "./PromptHistory";
import { useBuiltScript } from "./Scripts";

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
  const editor = useRef<PromptEditorHandle | null>(null);
  // No label above the box (the placeholder says which is which); the token count and tools
  // float in its top-right corner while the pointer is over it.
  return (
    <div className="group/prompt relative">
      <PromptEditor
        label={label}
        value={text}
        onChange={setValue}
        minRows={minRows}
        placeholder={placeholder}
        onSubmit={() => void generate()}
        className={className}
        handle={editor}
      />
      <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 rounded-sm bg-surface-3 pl-1.5 opacity-0 shadow-pop transition-opacity group-hover/prompt:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
        <TokenCount text={text} />
        {tools ? (
          <>
            <PromptHistoryButton prompt={text} setPrompt={setValue} editor={editor} />
            <IconButton
              icon="eraser"
              label={`Clear ${label.toLowerCase()}`}
              size="xs"
              onClick={() => setValue("")}
            />
          </>
        ) : (
          <span className="w-1" />
        )}
      </div>
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
  const busy = running || queued > 0;
  const script = useBuiltScript();
  const scripted = script.plan ?? (script.error ? true : null);

  return (
    // Stretches to the prompt boxes' height (the row's), so Generate grows when they're resized.
    <div className="flex w-[288px] shrink-0 flex-col gap-2 max-lg:w-full">
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        transition={bouncy}
        disabled={!ready}
        onClick={() => void generate()}
        className={cn(
          "group relative flex min-h-[72px] flex-1 flex-col items-center justify-center gap-1 overflow-hidden rounded-md text-on-generate focus-ring disabled:opacity-50",
          "bg-generate transition-[filter] hover:brightness-110",
        )}
      >
        {running ? (
          <span
            className="absolute inset-y-0 left-0 bg-white/18 transition-[width] duration-500 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        ) : null}
        <span className="relative flex items-center gap-2 text-xl font-semibold tracking-tight">
          {scripted || busy ? (
            <Icon name={scripted ? "layout-grid" : "plus"} size={20} strokeWidth={2} />
          ) : null}
          {scripted ? "Run script" : busy ? "Add to queue" : "Generate"}
        </span>
        {busy || scripted ? (
          <span className="relative text-xs text-white/80 tabular">
            {busy
              ? `${Math.round(progress * 100)}% · ${queued} queued`
              : script.plan
                ? `${script.plan.cells.length} image${script.plan.cells.length === 1 ? "" : "s"}`
                : "Script needs a fix"}
          </span>
        ) : null}
      </motion.button>
      <div className="grid grid-cols-2 gap-1.5">
        <Tooltip content="Stop this image; queued runs continue">
          <Button disabled={!running} onClick={() => void interrupt()} className="w-full">
            Interrupt
          </Button>
        </Tooltip>
        <Tooltip content="Stop and clear the queue">
          <Button
            variant="danger"
            disabled={!busy && !serverLoop}
            onClick={() => void cancelAll()}
            className="w-full"
          >
            Cancel
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
