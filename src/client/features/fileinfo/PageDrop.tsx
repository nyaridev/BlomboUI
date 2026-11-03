/**
 * Drop or paste a file anywhere in the window while File Info is open (header included). Listens
 * on the window only while the view is mounted; drops and pastes a control handled first (the drop
 * zone, a text field) are left alone.
 */
import { Icon } from "@client/icons/Icon";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export function usePageFileDrop(onFile: (file: File) => void): boolean {
  const [over, setOver] = useState(false);
  const latest = useRef(onFile);
  latest.current = onFile;

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes("Files"));
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
      if (e.defaultPrevented || !hasFiles(e)) return;
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) latest.current(file);
    };
    const paste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files[0];
      if (!file || e.defaultPrevented) return;
      e.preventDefault();
      latest.current(file);
    };
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
    };
  }, []);
  return over;
}

export function PageDropOverlay({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="pointer-events-none fixed inset-2 z-40 grid place-items-center rounded-xl border-2 border-dashed border-accent-ink/70 bg-bg/80"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-xl bg-accent/15 text-accent-ink">
              <Icon name="file-info" size={24} />
            </span>
            <span className="text-base font-semibold text-fg">Drop to see what's inside</span>
            <span className="max-w-sm text-sm text-fg-3">
              PNG, WebP and JPEG images · .safetensors models, looked up on Civitai by their hash
            </span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
