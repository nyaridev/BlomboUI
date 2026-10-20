/**
 * Drop an image anywhere on the Generate screen to reuse its settings: the server reads what it
 * carries (Blombo's own data, a ComfyUI graph or A1111 parameters) and "Use these settings"
 * applies it, switching workflows when the image came from one of yours. Drops that a control
 * inside handles first (the ControlNet image) are left alone.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { toast } from "@client/ui";
import { IMAGE_EXTENSIONS } from "@shared/gallery";
import { AnimatePresence, motion } from "motion/react";
import { type DragEvent, useRef, useState } from "react";
import { applyImageSettings } from "./applySettings";

const isImage = (f: File) =>
  f.type.startsWith("image/") || IMAGE_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext));

/** Drag handlers for the Generate view and whether to show the overlay. */
export function useImageDrop() {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const handlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop: (e: DragEvent) => {
      depth.current = 0;
      setOver(false);
      if (e.defaultPrevented || !hasFiles(e)) return;
      e.preventDefault();
      const file = Array.from(e.dataTransfer.files).find(isImage);
      if (!file) {
        toast("Drop a PNG, WebP or JPEG here. Workflows go on the workflow switcher.", "info");
        return;
      }
      void readSettingsFrom(file, setBusy);
    },
  };
  return { over, busy, handlers };
}

async function readSettingsFrom(file: File, setBusy: (b: boolean) => void): Promise<void> {
  setBusy(true);
  try {
    const info = await api.fileInfo(file, file.name);
    const image = info.image;
    const has =
      image &&
      (image.settings.workflowId ||
        image.settings.values ||
        Object.keys(image.settings.roles).length > 0);
    if (!image || !has) {
      toast(`“${file.name}” has no generation settings to reuse.`, "warning");
      return;
    }
    const ok = await applyImageSettings(image.settings, image.summary.seed);
    if (ok) toast(`Loaded the settings from “${file.name}”`, "success");
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), "error");
  } finally {
    setBusy(false);
  }
}

export function ImageDropOverlay({ over, busy }: { over: boolean; busy: boolean }) {
  return (
    <AnimatePresence>
      {over || busy ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="pointer-events-none absolute inset-2 z-40 grid place-items-center rounded-xl border-2 border-dashed border-accent-ink/70 bg-bg/80"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-xl bg-accent/15 text-accent-ink">
              <Icon
                name={busy ? "refresh" : "image"}
                size={24}
                className={busy ? "animate-spin" : ""}
              />
            </span>
            <span className="text-base font-semibold text-fg">
              {busy ? "Reading the image…" : "Drop to use this image's settings"}
            </span>
            <span className="max-w-sm text-sm text-fg-3">
              Prompt, model, sampler, size and seed go into the workflow that made it, or into the
              matching controls of this one.
            </span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
