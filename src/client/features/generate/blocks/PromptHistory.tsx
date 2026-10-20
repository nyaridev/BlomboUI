/**
 * The clock beside the prompt: prompts you generated with (newest first, from the job log) and
 * your snippets (the profile's snippets.json). A recent prompt replaces the prompt (or is added
 * to it); a snippet goes in at the cursor, comma separated.
 */
import { Icon } from "@client/icons/Icon";
import { useDebounced } from "@client/lib/hooks";
import {
  usePromptHistory,
  useRemoveSnippet,
  useSaveSnippet,
  useSnippets,
} from "@client/lib/queries";
import { IconButton, Popover, Spinner, Tabs, TextField, toast } from "@client/ui";
import { type RefObject, useState } from "react";
import { SyntaxText } from "../../help/SyntaxText";
import type { PromptEditorHandle } from "../PromptEditor";
import { appendToPrompt } from "../promptText";

function ago(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function PromptHistoryButton({
  prompt,
  setPrompt,
  editor,
}: {
  prompt: string;
  setPrompt: (text: string) => void;
  editor: RefObject<PromptEditorHandle | null>;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"recent" | "snippets">("recent");
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-end"
      className="w-[460px] p-0"
      trigger={
        <IconButton
          icon="history"
          label="Recent prompts and snippets"
          size="xs"
          tooltip={false}
          active={open}
        />
      }
    >
      {(close) => (
        <div className="flex max-h-[min(70vh,520px)] flex-col">
          <div className="border-b border-line px-3 pt-1.5">
            <Tabs
              variant="line"
              label="Prompt history"
              value={tab}
              onChange={setTab}
              items={[
                { value: "recent", label: "Recent", icon: "clock" },
                { value: "snippets", label: "Snippets", icon: "text" },
              ]}
              className="border-b-0"
            />
          </div>
          {tab === "recent" ? (
            <Recent
              onUse={(text) => {
                setPrompt(text);
                close();
              }}
              onAdd={(text) => {
                setPrompt(appendToPrompt(prompt, text));
                close();
              }}
            />
          ) : (
            <Snippets
              prompt={prompt}
              onInsert={(text) => {
                if (editor.current) editor.current.insert(text);
                else setPrompt(appendToPrompt(prompt, text));
                close();
              }}
            />
          )}
        </div>
      )}
    </Popover>
  );
}

function Recent({ onUse, onAdd }: { onUse: (t: string) => void; onAdd: (t: string) => void }) {
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 200);
  const list = usePromptHistory(q);
  return (
    <div className="flex min-h-0 flex-col">
      <div className="p-2">
        <TextField
          icon="search"
          size="sm"
          placeholder="Search your prompts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          autoFocus
        />
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        {list.isLoading ? (
          <div className="grid place-items-center py-6 text-fg-3">
            <Spinner />
          </div>
        ) : !list.data?.length ? (
          <p className="px-3 py-6 text-center text-xs text-fg-3">
            {q
              ? "No prompt you used matches."
              : "Prompts you generate with show up here, newest first."}
          </p>
        ) : (
          list.data.map((p) => (
            <div
              key={p.text}
              className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-field"
            >
              <button
                type="button"
                onClick={() => onUse(p.text)}
                className="flex min-w-0 flex-1 flex-col gap-0.5 text-left focus-ring"
                title="Use this prompt"
              >
                <SyntaxText text={p.text} className="line-clamp-2 text-xs" />
                <span className="text-2xs text-fg-4">
                  {ago(p.lastUsed)} · {p.uses} run{p.uses === 1 ? "" : "s"}
                </span>
              </button>
              <IconButton
                icon="plus"
                size="xs"
                label="Add to the prompt"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => onAdd(p.text)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Snippets({ prompt, onInsert }: { prompt: string; onInsert: (t: string) => void }) {
  const list = useSnippets();
  const save = useSaveSnippet();
  const remove = useRemoveSnippet();
  const [name, setName] = useState("");
  return (
    <div className="flex min-h-0 flex-col">
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-1.5 pt-1.5">
        {list.isLoading ? (
          <div className="grid place-items-center py-6 text-fg-3">
            <Spinner />
          </div>
        ) : !list.data?.length ? (
          <p className="px-3 py-6 text-center text-xs text-fg-3">
            Save pieces you reuse (quality tags, a character's look) and drop them in at the cursor.
          </p>
        ) : (
          list.data.map((s) => (
            <div
              key={s.id}
              className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-field"
            >
              <button
                type="button"
                onClick={() => onInsert(s.text)}
                className="flex min-w-0 flex-1 flex-col gap-0.5 text-left focus-ring"
                title="Insert at the cursor"
              >
                <span className="text-xs font-medium text-fg">{s.name}</span>
                <SyntaxText text={s.text} className="line-clamp-2 text-xs text-fg-2" />
              </button>
              <IconButton
                icon="trash"
                size="xs"
                label={`Remove “${s.name}”`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => remove.mutate(s.id, { onError: (e) => toast(e.message, "error") })}
              />
            </div>
          ))
        )}
      </div>
      <form
        className="flex items-center gap-1.5 border-t border-line p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !prompt.trim()) return;
          save.mutate(
            { name: name.trim(), text: prompt.trim() },
            {
              onSuccess: (s) => {
                toast(`Saved “${s.name}”`, "success");
                setName("");
              },
              onError: (err) => toast(err.message, "error"),
            },
          );
        }}
      >
        <TextField
          size="sm"
          placeholder="Name, then save the current prompt"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1"
          aria-label="Snippet name"
        />
        <IconButton
          icon="save"
          size="sm"
          type="submit"
          label={prompt.trim() ? "Save the prompt as a snippet" : "Write a prompt first"}
          disabled={!name.trim() || !prompt.trim()}
        />
      </form>
      <span className="flex items-center gap-1.5 px-3 pb-2 text-2xs text-fg-4">
        <Icon name="info" size={11} /> Snippets are saved in this profile's snippets.json.
      </span>
    </div>
  );
}
