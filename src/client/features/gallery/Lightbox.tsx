/**
 * Lightbox: the full image with zoom and pan, a filmstrip of its neighbors, and a details sheet
 * with what the image says about how it was made, plus its actions (use these settings, import
 * the workflow, File Info, reveal, copy, favorite, move to trash).
 *
 * Keys: ← → browse, Esc close, F favorite, Z zoom, Delete move to trash.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useHotkey } from "@client/lib/hooks";
import { glide } from "@client/lib/motion";
import { formatBytes } from "@client/lib/number";
import {
  useFavorite,
  useGalleryImage,
  useImportWorkflow,
  useRateImages,
  useTrashImages,
} from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Badge, Button, CopyButton, IconButton, PropertyList, Skeleton, toast } from "@client/ui";
import { fileUrl, type GalleryImage, type ImageDetails } from "@shared/gallery";
import { motion } from "motion/react";
import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { useFileInfoTarget } from "../fileinfo/state";
import { applyImageSettings } from "../generate/applySettings";
import { controlImageFromGallery } from "../generate/blocks/stages";
import { useActiveChoice } from "../generate/workflow";
import { Marks } from "./Marks";

export function Lightbox({
  images,
  current,
  onChange,
  onClose,
  onNeedMore,
  onGo,
}: {
  images: GalleryImage[];
  current: GalleryImage;
  onChange: (id: number) => void;
  onClose: () => void;
  /** Near the end of the loaded list: load the next page. */
  onNeedMore: () => void;
  /** Leave the gallery for another view (after "use these settings", File Info…). */
  onGo: (view: "generate" | "file-info") => void;
}) {
  const idx = images.findIndex((i) => i.id === current.id);
  const details = useGalleryImage(current.id);
  const favorite = useFavorite();
  const rate = useRateImages();
  // 1–5 set the stars, 0 clears (Settings → Shortcuts lists them).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey || !/^[0-5]$/.test(e.key)) return;
      e.preventDefault();
      rate.mutate({ ids: [current.id], rating: Number(e.key) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current.id, rate]);
  const trash = useTrashImages();
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (idx >= images.length - 5) onNeedMore();
  }, [idx, images.length, onNeedMore]);

  const go = useCallback(
    (d: number) => {
      const next = images[idx + d];
      if (next) {
        setZoom(false);
        onChange(next.id);
      }
    },
    [idx, images, onChange],
  );
  const remove = useCallback(() => {
    const next = images[idx + 1] ?? images[idx - 1];
    const { id, name } = current;
    // The list may refresh (live bus) before the request answers, so move on first, and report
    // from the promise: this lightbox can be gone by then.
    if (next) onChange(next.id);
    else onClose();
    trash
      .mutateAsync([id])
      .then((r) =>
        toast(`Moved "${name}" to the trash`, "success", {
          label: "Undo",
          run: () => void api.restoreImages(r.ids).catch((e: Error) => toast(e.message, "error")),
        }),
      )
      .catch((e: Error) => {
        toast(e.message, "error");
        onChange(id);
      });
  }, [current, idx, images, onChange, onClose, trash]);

  useHotkey("Escape", onClose);
  useHotkey("ArrowRight", () => go(1));
  useHotkey("ArrowLeft", () => go(-1));
  useHotkey("f", () => favorite.mutate({ ids: [current.id], favorite: !current.favorite }));
  useHotkey("z", () => setZoom((z) => !z));
  useHotkey("Delete", remove);

  const strip = images.slice(Math.max(0, idx - 10), idx + 11);

  return (
    <motion.div
      className="fixed inset-0 z-[250] flex bg-black/94"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      role="dialog"
      aria-modal="true"
      aria-label={current.name}
    >
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Stage image={current} zoom={zoom} onZoom={setZoom} />
        <button
          type="button"
          aria-label="Previous image"
          disabled={idx <= 0}
          onClick={() => go(-1)}
          className="absolute top-1/2 left-4 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/8 text-white/80 hover:bg-white/15 focus-ring disabled:opacity-25"
        >
          <Icon name="chevron-left" size={22} />
        </button>
        <button
          type="button"
          aria-label="Next image"
          disabled={idx >= images.length - 1}
          onClick={() => go(1)}
          className="absolute top-1/2 right-4 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/8 text-white/80 hover:bg-white/15 focus-ring disabled:opacity-25"
        >
          <Icon name="chevron-right" size={22} />
        </button>
        <div className="scroll-quiet flex h-[86px] shrink-0 items-center justify-center gap-1.5 overflow-x-auto px-6 pb-4">
          {strip.map((i) => (
            <button
              key={i.id}
              type="button"
              aria-label={`Show ${i.name}`}
              aria-current={i.id === current.id || undefined}
              onClick={() => {
                setZoom(false);
                onChange(i.id);
              }}
              className={cn(
                "h-16 shrink-0 overflow-hidden rounded-sm border-2 bg-white/5 transition-all focus-ring",
                i.id === current.id
                  ? "border-white"
                  : "border-transparent opacity-50 hover:opacity-90",
              )}
              style={{ width: Math.max(28, Math.min(120, 64 * (i.width / Math.max(1, i.height)))) }}
            >
              <img src={i.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>
      <Details
        image={current}
        index={idx}
        count={images.length}
        details={details.data}
        loading={details.isLoading}
        error={details.error?.message ?? null}
        onClose={onClose}
        onFavorite={() => favorite.mutate({ ids: [current.id], favorite: !current.favorite })}
        onRemove={remove}
        removing={trash.isPending}
        onGo={onGo}
      />
    </motion.div>
  );
}

/** The image, fit to the space, or at 100% with drag-to-pan. */
function Stage({
  image,
  zoom,
  onZoom,
}: {
  image: GalleryImage;
  zoom: boolean;
  onZoom: (z: boolean) => void;
}) {
  const [loaded, setLoaded] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; sx: number; sy: number; moved: boolean } | null>(
    null,
  );

  // Center the 100% view on open.
  useEffect(() => {
    const el = box.current;
    if (!zoom || !el) return;
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  }, [zoom]);

  const onDown = (e: PointerEvent) => {
    if (!zoom || !box.current) return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      sx: box.current.scrollLeft,
      sy: box.current.scrollTop,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !box.current) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
    box.current.scrollLeft = d.sx - (e.clientX - d.x);
    box.current.scrollTop = d.sy - (e.clientY - d.y);
  };
  const onUp = () => {
    const moved = drag.current?.moved;
    drag.current = null;
    if (!moved && zoom) onZoom(false);
  };

  return (
    <div
      ref={box}
      className={cn(
        "relative min-h-0 flex-1 [container-type:size]",
        zoom ? "scroll-quiet cursor-grab overflow-auto active:cursor-grabbing" : "overflow-hidden",
      )}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {zoom ? (
        <div
          className="grid min-h-full min-w-full place-items-center p-8"
          style={{ width: "max-content" }}
        >
          <img
            src={fileUrl(image)}
            alt={image.name}
            draggable={false}
            style={{ width: image.width, height: image.height, maxWidth: "none" }}
          />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-8">
          <motion.button
            key={image.id}
            type="button"
            aria-label="Zoom to 100%"
            onClick={() => onZoom(true)}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={glide}
            className="relative cursor-zoom-in overflow-hidden rounded-md bg-white/5 shadow-pop focus-ring"
            style={{
              aspectRatio: `${image.width} / ${image.height}`,
              width: `min(100cqw - 64px, (100cqh - 64px) * ${image.width / Math.max(1, image.height)}, ${image.width}px)`,
            }}
          >
            <img src={image.thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <img
              src={fileUrl(image)}
              alt={image.name}
              draggable={false}
              onLoad={() => setLoaded(image.id)}
              className={cn(
                "absolute inset-0 h-full w-full object-contain transition-opacity duration-200",
                loaded === image.id ? "opacity-100" : "opacity-0",
              )}
            />
          </motion.button>
        </div>
      )}
    </div>
  );
}

function Details({
  image,
  index,
  count,
  details,
  loading,
  error,
  onClose,
  onFavorite,
  onRemove,
  removing,
  onGo,
}: {
  image: GalleryImage;
  index: number;
  count: number;
  details: ImageDetails | undefined;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onFavorite: () => void;
  onRemove: () => void;
  removing: boolean;
  onGo: (view: "generate" | "file-info") => void;
}) {
  const importWorkflow = useImportWorkflow();
  const setFileInfo = useFileInfoTarget((s) => s.set);
  const s = details?.summary;
  const sizeLine =
    s?.width && s.height && (s.width !== image.width || s.height !== image.height)
      ? `${image.width}×${image.height} (made at ${s.width}×${s.height})`
      : `${image.width}×${image.height}`;

  const copyImage = async () => {
    try {
      const blob = await (await fetch(fileUrl(image))).blob();
      const png =
        blob.type === "image/png"
          ? blob
          : await createImageBitmap(blob).then((bmp) => {
              const c = document.createElement("canvas");
              c.width = bmp.width;
              c.height = bmp.height;
              c.getContext("2d")?.drawImage(bmp, 0, 0);
              return new Promise<Blob>((res, rej) =>
                c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/png"),
              );
            });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      toast("Image copied", "success");
    } catch {
      toast("Couldn't copy the image. Your browser may not allow it here.", "error");
    }
  };

  const importIt = async () => {
    const blob = await (await fetch(fileUrl(image))).blob();
    importWorkflow.mutate(new File([blob], image.name, { type: blob.type }), {
      onSuccess: (r) => {
        const profileId = useSession.getState().profileId;
        if (profileId) useActiveChoice.getState().choose(profileId, r.workflow.id);
        toast(`Imported "${r.workflow.name}". It's now the active workflow.`, "success");
      },
      onError: (e) => toast(e.message, "error"),
    });
  };

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="text-sm font-semibold text-fg">Details</span>
        <Badge>
          {(index + 1).toLocaleString()} / {count.toLocaleString()}
        </Badge>
        <span className="ml-auto flex">
          <IconButton
            icon="heart"
            label={image.favorite ? "Remove from favorites" : "Add to favorites"}
            shortcut="F"
            size="sm"
            active={image.favorite}
            className={image.favorite ? "text-pink-ink [&_svg]:fill-current" : undefined}
            onClick={onFavorite}
          />
          <IconButton icon="x" label="Close" shortcut="Esc" size="sm" onClick={onClose} />
        </span>
      </div>
      <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <Marks image={image} details={details} />
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : s ? (
          <>
            {s.source === "none" ? (
              <p className="rounded-md border border-dashed border-line px-3 py-2.5 text-sm text-fg-3">
                This image has no generation settings in it.
              </p>
            ) : null}
            {s.prompt ? <TextBlock label="Prompt" text={s.prompt} /> : null}
            {s.negative ? <TextBlock label="Negative prompt" text={s.negative} /> : null}
            <PropertyList
              items={[
                { label: "Model", value: s.model, copy: s.model ?? undefined },
                {
                  label: "LoRAs",
                  value: s.loras.length
                    ? s.loras
                        .map((l) => `${l.name}${l.strength !== null ? ` ${l.strength}` : ""}`)
                        .join(", ")
                    : null,
                },
                {
                  label: "Sampler",
                  value: [s.sampler, s.scheduler].filter(Boolean).join(" · ") || null,
                },
                {
                  label: "Steps / CFG",
                  value:
                    s.steps !== null || s.cfg !== null
                      ? `${s.steps ?? "—"} / ${s.cfg ?? "—"}`
                      : null,
                },
                {
                  label: "Seed",
                  value: s.seed,
                  copy: s.seed !== null ? String(s.seed) : undefined,
                  mono: true,
                },
                { label: "Size", value: sizeLine },
                { label: "Workflow", value: s.workflow },
                { label: "Made with", value: SOURCE_LABEL[s.source] },
              ]}
            />
          </>
        ) : null}
        <PropertyList
          className="border-t border-line pt-3"
          items={[
            { label: "File", value: image.name, copy: image.name },
            {
              label: "Folder",
              value: image.path.includes("/")
                ? image.path.slice(0, image.path.lastIndexOf("/"))
                : null,
            },
            { label: "Size on disk", value: formatBytes(image.size) },
            { label: "Saved", value: new Date(image.mtime).toLocaleString() },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5 border-t border-line p-3">
        <Button
          variant="primary"
          icon="generate"
          className="col-span-2"
          disabled={!details || s?.source === "none"}
          onClick={() => {
            if (!details) return;
            void applyImageSettings(details.settings, details.summary.seed).then(
              (ok) => ok && onGo("generate"),
            );
          }}
        >
          Use these settings
        </Button>
        {details?.hasWorkflow ? (
          <Button icon="import" loading={importWorkflow.isPending} onClick={() => void importIt()}>
            Import workflow
          </Button>
        ) : null}
        <Button
          icon="file-info"
          onClick={() => {
            setFileInfo({ type: "gallery", id: image.id, name: image.name });
            onGo("file-info");
          }}
        >
          File info
        </Button>
        <Button
          icon="folder-open"
          onClick={() =>
            void api.revealImage(image.id).catch((e: Error) => toast(e.message, "error"))
          }
        >
          Reveal
        </Button>
        <Button icon="copy" onClick={() => void copyImage()}>
          Copy
        </Button>
        <Button
          icon="pose"
          title="Use this image in a ControlNet unit on the Generate screen"
          onClick={() =>
            void controlImageFromGallery(image.id).then((ok) => ok && onGo("generate"))
          }
        >
          Use for ControlNet
        </Button>
        <Button
          icon="trash"
          variant="danger"
          loading={removing}
          onClick={onRemove}
          title="Move to trash (Delete)"
        >
          Remove
        </Button>
      </div>
    </aside>
  );
}

const SOURCE_LABEL = {
  blombo: "BlomboUI",
  comfy: "ComfyUI",
  a1111: "A1111 / Forge",
  none: null,
} as const;

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="group flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="label-caps">{label}</span>
        <CopyButton text={text} label={`Copy ${label.toLowerCase()}`} />
      </div>
      <p className="max-h-48 overflow-y-auto rounded-md border border-line bg-field p-2.5 text-sm leading-relaxed whitespace-pre-wrap text-fg-2">
        {text}
      </p>
    </div>
  );
}
