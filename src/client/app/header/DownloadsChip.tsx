/**
 * The header's downloads indicator, next to the generation queue: overall progress while files
 * download, a "paused" or "failed" reminder otherwise, and a popover with every download. Accent
 * colored: orange belongs to Generate.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useGoToView } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import { snappy } from "@client/lib/motion";
import { Button, Popover, ProgressRing, Tooltip, toast } from "@client/ui";
import { AnimatePresence, motion } from "motion/react";
import { DownloadRow } from "../../features/downloads/DownloadRow";

export function DownloadsChip() {
  const items = useLive((s) => s.downloads);
  const progress = useLive((s) => s.downloadProgress);
  const goTo = useGoToView();
  const active = items.filter((d) => d.state === "running" || d.state === "queued");
  const waiting = items.filter((d) => d.state === "paused" || d.state === "error");
  const visible = active.length > 0 || waiting.length > 0;
  let got = 0;
  let total = 0;
  for (const d of active) {
    const p = progress[d.id];
    const size = p?.size ?? d.size;
    if (!size) continue;
    total += size;
    got += p?.received ?? d.received;
  }
  const value = total ? got / total : 0;
  const failed = waiting.some((d) => d.state === "error");

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: "auto" }}
          exit={{ opacity: 0, width: 0 }}
          transition={snappy}
          className="overflow-hidden"
        >
          <Popover
            placement="bottom-end"
            className="w-[420px] p-0"
            trigger={
              <button
                type="button"
                aria-label={
                  active.length
                    ? `Downloading ${active.length} file${active.length === 1 ? "" : "s"}, ${Math.round(value * 100)}%`
                    : `${waiting.length} download${waiting.length === 1 ? "" : "s"} waiting`
                }
                className={
                  active.length
                    ? "mr-1 flex h-8 items-center gap-2 rounded-md border border-accent/40 bg-accent/10 pr-2.5 pl-1.5 text-xs font-medium text-accent-ink focus-ring"
                    : "mr-1 flex h-8 items-center gap-1.5 rounded-md border border-line bg-sunken px-2 text-xs font-medium text-fg-2 focus-ring"
                }
              >
                {active.length ? (
                  <>
                    <ProgressRing value={value} />
                    <span className="tabular">{Math.round(value * 100)}%</span>
                    {active.length > 1 ? (
                      <span className="text-fg-3">
                        <Icon name="download" size={12} className="mr-0.5 inline" />
                        {active.length}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <Tooltip content={failed ? "A download failed" : "Downloads are paused"}>
                    <span className="flex items-center gap-1.5">
                      <Icon
                        name={failed ? "x-circle" : "pause"}
                        size={14}
                        className={failed ? "text-danger" : "text-warning"}
                      />
                      <Icon name="download" size={14} />
                      <span className="tabular">{waiting.length}</span>
                    </span>
                  </Tooltip>
                )}
              </button>
            }
          >
            {(close) => (
              <div className="flex max-h-[70vh] flex-col">
                <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
                  <Icon name="download" size={15} className="text-fg-3" />
                  <span className="text-sm font-semibold text-fg">Downloads</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() =>
                      void api.clearDownloads().catch((e: Error) => toast(e.message, "error"))
                    }
                  >
                    Clear finished
                  </Button>
                </div>
                <div className="scroll-quiet flex min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto">
                  {items.map((d) => (
                    <DownloadRow key={d.id} d={d} dense />
                  ))}
                </div>
                <div className="flex justify-end border-t border-line p-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="history"
                    onClick={() => {
                      close();
                      goTo("history");
                    }}
                  >
                    Download history
                  </Button>
                </div>
              </div>
            )}
          </Popover>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
