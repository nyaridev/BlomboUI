/**
 * Line mode: a wildcard file as rows you can edit, add, remove and reorder. A .txt file is one
 * list (virtualized, so a 10 000-line file stays quick); a YAML file opens in Sections
 * (YamlSections.tsx).
 */
import { Button, IconButton, InlineInput } from "@client/ui";
import type { WildcardFormat } from "@shared/wildcards";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import { fromLines, toLines } from "./lines";
import { YamlSections } from "./YamlSections";

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
  return <YamlSections text={text} onChange={onChange} />;
}

function LineList({ lines, onChange }: { lines: string[]; onChange: (lines: string[]) => void }) {
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
                <span className="flex opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100 group-focus-within:opacity-100">
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
