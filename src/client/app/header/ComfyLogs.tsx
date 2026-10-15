/**
 * ComfyUI's console in a dialog. Lines stream over the live bus while it's open (the server
 * only follows the log when someone is reading it). Virtualized: a start can print thousands.
 */
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { followTopic, setLogs, useLive } from "@client/lib/live";
import { Button, Dialog, toast } from "@client/ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";

const ROW = 19;

export function ComfyLogs({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="ComfyUI log"
      description="What ComfyUI prints while it starts and runs. New lines appear as they're written."
      width={920}
    >
      {open ? <LogLines /> : null}
    </Dialog>
  );
}

function LogLines() {
  const lines = useLive((s) => s.logs);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const virtual = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW,
    overscan: 20,
  });

  useEffect(() => {
    const off = followTopic("logs");
    api
      .comfyLogs()
      .then((r) => setLogs(r.lines))
      .catch(() => undefined);
    return off;
  }, []);

  useEffect(() => {
    if (stick.current && lines.length) virtual.scrollToIndex(lines.length - 1, { align: "end" });
  }, [lines.length, virtual]);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="scroll-quiet h-[56vh] overflow-auto rounded-md border border-line bg-sunken font-mono text-xs"
      >
        {lines.length === 0 ? (
          <p className="p-4 text-fg-3">Nothing logged yet. Start ComfyUI to see its output here.</p>
        ) : (
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {virtual.getVirtualItems().map((row) => {
              const line = lines[row.index];
              if (!line) return null;
              return (
                <div
                  key={row.key}
                  className={cn(
                    "absolute inset-x-0 truncate px-3 leading-[19px] whitespace-pre",
                    line.stream === "sys"
                      ? "text-accent-ink"
                      : line.stream === "err"
                        ? "text-fg-2"
                        : "text-fg-3",
                  )}
                  style={{ top: row.start, height: ROW }}
                  title={line.text}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          icon="copy"
          onClick={() => {
            void navigator.clipboard
              .writeText(
                useLive
                  .getState()
                  .logs.map((l) => l.text)
                  .join("\n"),
              )
              .then(() => toast("Log copied", "success"));
          }}
        >
          Copy all
        </Button>
      </div>
    </div>
  );
}
