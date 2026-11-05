/**
 * Drop or paste files anywhere in the window while a view is open (header included): File Info
 * reads one, the gallery adds images to itself. Listens on the window only while `enabled` (a
 * kept-alive view passes whether it's on screen); drops and pastes a control handled first (the
 * drop zone, a text field) are left alone, and so are drags that started in the page (a tile's
 * picture carries "Files" too).
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export function usePageFileDrop(onFiles: (files: File[]) => void, enabled = true): boolean {
  const [over, setOver] = useState(false);
  const latest = useRef(onFiles);
  latest.current = onFiles;

  useEffect(() => {
    if (!enabled) {
      setOver(false);
      return;
    }
    let depth = 0;
    let inPage = false;
    const hasFiles = (e: DragEvent) => !inPage && Boolean(e.dataTransfer?.types.includes("Files"));
    const start = () => {
      inPage = true;
    };
    const end = () => {
      inPage = false;
    };
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      depth = 0;
      setOver(false);
      if (e.defaultPrevented || !hasFiles(e)) return end();
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) latest.current(files);
    };
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length || e.defaultPrevented) return;
      e.preventDefault();
      latest.current(files);
    };
    window.addEventListener("dragstart", start);
    window.addEventListener("dragend", end);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("paste", paste);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      window.removeEventListener("dragstart", start);
      window.removeEventListener("dragend", end);
    };
  }, [enabled]);
  return over;
}

export function PageDropOverlay({
  show,
  icon = "file-info",
  title = "Drop to see what's inside",
  text = "PNG, WebP and JPEG images · .safetensors models, looked up on Civitai by their hash",
}: {
  show: boolean;
  icon?: IconName;
  title?: string;
  text?: string;
}) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="pointer-events-none fixed inset-2 z-[200] grid place-items-center rounded-xl border-2 border-dashed border-accent-ink/70 bg-bg/80"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-xl bg-accent/15 text-accent-ink">
              <Icon name={icon} size={24} />
            </span>
            <span className="text-base font-semibold text-fg">{title}</span>
            <span className="max-w-sm text-sm text-fg-3">{text}</span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
