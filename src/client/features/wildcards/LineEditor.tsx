/**
 * Line mode: a wildcard file as rows you can edit, add, remove and reorder. A .txt file is one
 * list; a YAML file shows its keys on the left and the chosen key's list on the right.
 * Virtualized, so a 10 000-line file stays quick.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { Button, IconButton, InlineInput, TextField } from "@client/ui";
import type { WildcardFormat } from "@shared/wildcards";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { addYamlList, fromLines, setYamlList, toLines, yamlLists } from "./lines";

export function LineEditor({
  text,
  format,
  onChange,
}: {
  text: string;
  format: WildcardFormat;
  onChange: (text: string) => void;
}) {
  if (format === "txt")
    return <LineList lines={toLines(text)} onChange={(lines) => onChange(fromLines(lines))} />;
  return <YamlLines text={text} onChange={onChange} />;
}

function YamlLines({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  const { lists, error } = useMemo(() => yamlLists(text), [text]);
  const [key, setKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const current = lists.find((l) => l.path === key) ?? lists[0];
  if (error)
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <p className="max-w-sm text-sm text-fg-3">
          <Icon name="errors" size={16} className="mb-2 inline text-warning" />
          <br />
          This YAML has an error, so it can't be shown as lists. Fix it in Raw mode first: {error}
        </p>
      </div>
    );
  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-56 shrink-0 flex-col border-r border-line">
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-1.5">
          {lists.map((l) => (
            <button
              key={l.path}
              type="button"
              onClick={() => setKey(l.path)}
              className={cn(
                "flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-xs transition-colors focus-ring",
                current?.path === l.path ? "bg-accent/15 text-fg" : "text-fg-2 hover:bg-field",
              )}
            >
              <span className="flex-1 truncate font-mono">{l.path}</span>
              <span className="font-mono text-2xs text-fg-4 tabular">{l.items.length}</span>
            </button>
          ))}
          {lists.length === 0 ? <p className="px-2 py-4 text-xs text-fg-3">No lists yet.</p> : null}
        </div>
        <form
          className="flex gap-1 border-t border-line p-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const k = newKey.trim().replace(/^\/+|\/+$/g, "");
            if (!k) return;
            onChange(addYamlList(text, k));
            setKey(k);
            setNewKey("");
          }}
        >
          <TextField
            size="sm"
            mono
            placeholder="new/key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="flex-1"
            aria-label="New key"
          />
          <IconButton
            icon="plus"
            label="Add key"
            size="sm"
            type="submit"
            disabled={!newKey.trim()}
          />
        </form>
      </div>
      <div className="min-w-0 flex-1">
        {current ? (
          <LineList
            key={current.path}
            lines={current.items}
            onChange={(items) => onChange(setYamlList(text, current.path, items))}
            header={<span className="font-mono text-xs text-fg-2">__{current.path}__</span>}
          />
        ) : null}
      </div>
    </div>
  );
}

function LineList({
  lines,
  onChange,
  header,
}: {
  lines: string[];
  onChange: (lines: string[]) => void;
  header?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 34,
    overscan: 10,
  });
  const set = (i: number, v: string) => onChange(lines.map((l, j) => (j === i ? v : l)));
  const remove = (i: number) => onChange(lines.filter((_, j) => j !== i));
  const swap = (i: number, j: number) => {
    if (j < 0 || j >= lines.length) return;
    const next = lines.slice();
    [next[i], next[j]] = [next[j] as string, next[i] as string];
    onChange(next);
  };
  const add = (at = lines.length) => {
    const next = lines.slice();
    next.splice(at, 0, "");
    onChange(next);
    setFocusIndex(at);
    requestAnimationFrame(() => virtualizer.scrollToIndex(at, { align: "auto" }));
  };
  const options = lines.filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs text-fg-3">
        {header}
        <span className="tabular">
          {options.toLocaleString()} {options === 1 ? "option" : "options"}
        </span>
        <Button size="sm" variant="ghost" icon="plus" className="ml-auto" onClick={() => add()}>
          Add line
        </Button>
      </div>
      <div ref={scrollRef} className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((v) => {
            const line = lines[v.index] ?? "";
            const comment = line.trim().startsWith("#");
            return (
              <div
                key={v.key}
                className="group absolute inset-x-0 top-0 flex items-center gap-1 py-0.5"
                style={{ transform: `translateY(${v.start}px)`, height: 34 }}
              >
                <span className="w-10 shrink-0 text-right font-mono text-2xs text-fg-4 tabular">
                  {v.index + 1}
                </span>
                <InlineInput
                  value={line}
                  muted={comment}
                  ref={(el) => {
                    if (el && focusIndex === v.index) {
                      el.focus();
                      setFocusIndex(null);
                    }
                  }}
                  onChange={(e) => set(v.index, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      add(v.index + 1);
                    } else if (e.key === "Backspace" && line === "" && lines.length > 0) {
                      e.preventDefault();
                      remove(v.index);
                      setFocusIndex(Math.max(0, v.index - 1));
                    }
                  }}
                  aria-label={`Line ${v.index + 1}`}
                  className="flex-1"
                />
                <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <IconButton
                    icon="chevron-up"
                    label="Move up"
                    size="xs"
                    tooltip={false}
                    onClick={() => swap(v.index, v.index - 1)}
                  />
                  <IconButton
                    icon="chevron-down"
                    label="Move down"
                    size="xs"
                    tooltip={false}
                    onClick={() => swap(v.index, v.index + 1)}
                  />
                  <IconButton
                    icon="x"
                    label="Remove line"
                    size="xs"
                    variant="danger"
                    tooltip={false}
                    onClick={() => remove(v.index)}
                  />
                </span>
              </div>
            );
          })}
        </div>
        {lines.length === 0 ? (
          <p className="px-12 py-6 text-sm text-fg-3">Empty. Add a line, one option per line.</p>
        ) : null}
      </div>
    </div>
  );
}
