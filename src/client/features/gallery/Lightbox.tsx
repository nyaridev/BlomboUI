/**
 * Lightbox: the full image with zoom and drag (as in Generate's viewer), a filmstrip of its neighbors, and a details sheet
 * with what the image says about how it was made, plus its actions (use these settings, import
 * the workflow, File Info, reveal, copy, favorite, move to trash).
 *
 * The details sheet can be hidden (I, or its button): the image takes the whole width and a
 * few controls float over the backdrop's corner without a fill (where you are, rating,
 * favorite, show details, close). The choice is kept in this window.
 *
 * Keys: ← → browse, Esc close, F favorite, Z 100% / fit, I details, Delete move to trash.
 */

import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useClock } from "@client/lib/clock";
import { cn } from "@client/lib/cn";
import { useHotkey, useModalFocus } from "@client/lib/hooks";
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
import {
  Badge,
  Button,
  CopyButton,
  FIT,
  IconButton,
  PropertyList,
  Skeleton,
  StarRating,
  toast,
  useZoomPan,
} from "@client/ui";
import { fileUrl, type GalleryImage, type ImageDetails, playTime } from "@shared/gallery";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useFileInfoTarget } from "../fileinfo/state";
import { applyImageSettings } from "../generate/applySettings";
import { sourceImageFromGallery, sourceVideoFromGallery } from "../generate/blocks/Source";
import { controlImageFromGallery } from "../generate/blocks/stages";
import { useActiveChoice } from "../generate/workflow";
import { openCivitaiPage } from "../models/civitai/open";
import { copyImage } from "./imageMenu";
import { Marks } from "./Marks";
import { ModelLinks } from "./ModelLinks";
import { StagePlayer, stillOrAnimated } from "./media";

const DETAILS_KEY = "blombo.lightboxDetails";

/** Whether the details sheet shows; kept in this window (localStorage). */
const useDetailsShown = create<{ shown: boolean; toggle: () => void }>((set) => ({
  shown: (() => {
    try {
      return localStorage.getItem(DETAILS_KEY) !== "hidden";
    } catch {
      return true;
    }
  })(),
  toggle: () =>
    set((s) => {
      try {
        localStorage.setItem(DETAILS_KEY, s.shown ? "hidden" : "shown");
      } catch {
        // Storage can be unavailable; it still switches for this session.
      }
      return { shown: !s.shown };
    }),
}));

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
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocus(dialogRef);
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

  useEffect(() => {
    if (idx >= images.length - 5) onNeedMore();
  }, [idx, images.length, onNeedMore]);

  const go = useCallback(
    (d: number) => {
      const next = images[idx + d];
      if (next) onChange(next.id);
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
  useHotkey("i", () => useDetailsShown.getState().toggle());
  useHotkey("Delete", remove);
  const shown = useDetailsShown((s) => s.shown);
  const reuseSettings = () => {
    const d = details.data;
    if (!d) return;
    void applyImageSettings(d.settings, d.summary.seed).then((ok) => ok && onGo("generate"));
  };

  const strip = images.slice(Math.max(0, idx - 10), idx + 11);

  return (
    <motion.div
      // Narrow screens: image on top, details below it, the whole thing scrolls.
      className="fixed inset-0 z-[250] flex bg-black/94 max-lg:scroll-quiet max-lg:flex-col max-lg:overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      role="dialog"
      aria-modal="true"
      aria-label={current.name}
      ref={dialogRef}
      tabIndex={-1}
    >
      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col",
          // Narrow screens: the details stack under the image; without them it fills the screen.
          shown ? "max-lg:h-[60svh] max-lg:flex-none" : "max-lg:h-full",
        )}
      >
        <Stage image={current} />
        <AnimatePresence>
          {shown ? null : (
            <motion.div
              key="controls"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute top-2 right-3 z-10 flex items-center gap-0.5"
            >
              <span className="mr-2 text-xs text-white/55 tabular">
                {(idx + 1).toLocaleString()} / {images.length.toLocaleString()}
              </span>
              <StarRating
                tone="scrim"
                size="sm"
                value={current.rating}
                onChange={(rating) => rate.mutate({ ids: [current.id], rating })}
                className="mr-1"
              />
              <IconButton
                variant="scrim"
                icon="heart"
                label={current.favorite ? "Remove from favorites" : "Add to favorites"}
                shortcut="F"
                size="sm"
                className={current.favorite ? "text-pink-ink [&_svg]:fill-current" : undefined}
                onClick={() => favorite.mutate({ ids: [current.id], favorite: !current.favorite })}
              />
              <IconButton
                variant="scrim"
                icon="sidebar"
                label="Show details"
                shortcut="I"
                size="sm"
                onClick={() => useDetailsShown.getState().toggle()}
              />
              <IconButton
                variant="scrim"
                icon="x"
                label="Close"
                shortcut="Esc"
                size="sm"
                onClick={onClose}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          aria-label="Previous image"
          disabled={idx <= 0}
          onClick={() => go(-1)}
          className="absolute top-1/2 left-4 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md bg-white/8 text-white/80 hover:bg-white/15 focus-ring disabled:opacity-25"
        >
          <Icon name="chevron-left" size={22} />
        </button>
        <button
          type="button"
          aria-label="Next image"
          disabled={idx >= images.length - 1}
          onClick={() => go(1)}
          className="absolute top-1/2 right-4 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md bg-white/8 text-white/80 hover:bg-white/15 focus-ring disabled:opacity-25"
        >
          <Icon name="chevron-right" size={22} />
        </button>
        <div className="scroll-quiet flex h-[86px] shrink-0 items-center justify-center gap-1.5 overflow-x-auto px-6 pb-4 max-lg:hidden">
          {strip.map((i) => (
            <button
              key={i.id}
              type="button"
              aria-label={`Show ${i.name}`}
              aria-current={i.id === current.id || undefined}
              onClick={() => onChange(i.id)}
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
      {shown ? (
        <Details
          image={current}
          index={idx}
          count={images.length}
          details={details.data}
          loading={details.isLoading}
          error={details.error?.message ?? null}
          onClose={onClose}
          onHide={() => useDetailsShown.getState().toggle()}
          onFavorite={() => favorite.mutate({ ids: [current.id], favorite: !current.favorite })}
          onUseSettings={reuseSettings}
          onRemove={remove}
          removing={trash.isPending}
          onGo={onGo}
        />
      ) : null}
    </motion.div>
  );
}

/**
 * The image fitted to the space. The wheel on it zooms around the pointer and a drag moves it,
 * as in Generate's viewer (`useZoomPan`); double click or Z fits it again (Z also zooms to 100%).
 */
function Stage({ image }: { image: GalleryImage }) {
  const [loaded, setLoaded] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLDivElement>(null);
  const { setView, zoomed, handlers, style } = useZoomPan(root, picture);

  // Another image starts fitted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the image is the trigger
  useEffect(() => setView(FIT), [image.id, setView]);

  // Z: 100% (the image's own pixels; twice the size when it already fits at 100%), or fit.
  useHotkey("z", () => {
    const el = picture.current;
    if (zoomed || !el) return setView(FIT);
    setView({ scale: Math.max(2, image.width / Math.max(1, el.offsetWidth)), x: 0, y: 0 });
  });

  const player = image.media === "video" || image.media === "audio";
  return (
    <div ref={root} className="relative min-h-0 flex-1 overflow-hidden [container-type:size]">
      {player ? (
        <div className="flex h-full items-center justify-center p-8 max-lg:p-3">
          <StagePlayer image={image} />
        </div>
      ) : (
        <div className="relative flex h-full items-center justify-center p-8 max-lg:p-3">
          <motion.div
            key={image.id}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={glide}
            style={{
              aspectRatio: `${image.width} / ${image.height}`,
              width: `min(100cqw - 64px, (100cqh - 64px) * ${image.width / Math.max(1, image.height)}, ${image.width}px)`,
            }}
          >
            <div
              ref={picture}
              {...handlers}
              className="relative h-full w-full touch-none overflow-hidden rounded-md bg-white/5 shadow-pop select-none"
              style={style}
            >
              <img
                src={image.thumb}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
              />
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
            </div>
          </motion.div>
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
  onHide,
  onFavorite,
  onUseSettings,
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
  /** Hide the sheet (the image takes the whole width). */
  onHide: () => void;
  onFavorite: () => void;
  onUseSettings: () => void;
  onRemove: () => void;
  removing: boolean;
  onGo: (view: "generate" | "file-info") => void;
}) {
  const importWorkflow = useImportWorkflow();
  const clock = useClock();
  const setFileInfo = useFileInfoTarget((s) => s.set);
  const s = details?.summary;
  // Audio has no picture, so no size; anything that plays has a length.
  const sizeLine =
    image.media === "audio"
      ? null
      : s?.width && s.height && (s.width !== image.width || s.height !== image.height)
        ? `${image.width}×${image.height} (made at ${s.width}×${s.height})`
        : `${image.width}×${image.height}`;

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
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-line bg-surface max-lg:w-full max-lg:border-t max-lg:border-l-0">
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
          <IconButton icon="sidebar" label="Hide details" shortcut="I" size="sm" onClick={onHide} />
          <IconButton icon="x" label="Close" shortcut="Esc" size="sm" onClick={onClose} />
        </span>
      </div>
      <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 max-lg:overflow-visible">
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
                This{" "}
                {image.media === "video" ? "video" : image.media === "audio" ? "file" : "image"} has
                no generation settings in it.
              </p>
            ) : null}
            {s.prompt ? <TextBlock label="Prompt" text={s.prompt} /> : null}
            {s.negative ? <TextBlock label="Negative prompt" text={s.negative} /> : null}
            <PropertyList
              items={[
                {
                  label: "Model",
                  value: s.model ? (
                    <ModelLinks
                      summary={s}
                      kind="model"
                      onFileInfo={() => onGo("file-info")}
                      onLeave={onClose}
                    />
                  ) : null,
                  copy: s.model ?? undefined,
                },
                {
                  label: "LoRAs",
                  value: s.loras.length ? (
                    <ModelLinks
                      summary={s}
                      kind="lora"
                      onFileInfo={() => onGo("file-info")}
                      onLeave={onClose}
                    />
                  ) : null,
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
                {
                  label: "Length",
                  value: image.duration !== null ? playTime(image.duration) : null,
                },
                { label: "Workflow", value: s.workflow },
                { label: "Made with", value: SOURCE_LABEL[s.source] },
              ]}
            />
          </>
        ) : null}
        <PropertyList
          className="border-t border-line pt-3"
          items={[
            {
              label: "Added from",
              value:
                image.origin === "civitai" ? (
                  details?.civitai?.page ? (
                    <button
                      type="button"
                      onClick={() => openCivitaiPage(details.civitai?.page ?? "", image.name)}
                      className="inline-flex items-center gap-1 rounded-sm text-accent-ink hover:underline focus-ring"
                    >
                      Civitai
                      <Icon name="external" size={12} />
                    </button>
                  ) : (
                    "Civitai"
                  )
                ) : image.origin === "imported" ? (
                  "Your PC"
                ) : null,
            },
            { label: "Posted by", value: details?.civitai?.by },
            { label: "File", value: image.name, copy: image.name },
            {
              label: "Folder",
              value: image.path.includes("/")
                ? image.path.slice(0, image.path.lastIndexOf("/"))
                : null,
            },
            { label: "Size on disk", value: formatBytes(image.size) },
            { label: "Saved", value: clock.dateTime(image.mtime) },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5 border-t border-line p-3">
        <Button
          variant="primary"
          icon="generate"
          className="col-span-2"
          disabled={!details || s?.source === "none"}
          onClick={onUseSettings}
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
        <Button
          icon="copy"
          disabled={!stillOrAnimated(image)}
          onClick={() => void copyImage(image)}
        >
          Copy
        </Button>
        <Button
          icon="pose"
          disabled={!stillOrAnimated(image)}
          title="Use this image in a ControlNet unit on the Generate screen"
          onClick={() =>
            void controlImageFromGallery(image.id).then((ok) => ok && onGo("generate"))
          }
        >
          Use for ControlNet
        </Button>
        <Button
          icon="image"
          disabled={!stillOrAnimated(image)}
          title="Start Generate's first pass from this image (image to image or inpaint)"
          onClick={() => void sourceImageFromGallery(image.id).then((ok) => ok && onGo("generate"))}
        >
          Start from it
        </Button>
        {image.media === "video" ? (
          <Button
            icon="skip"
            title="Make the open video workflow's next video continue this one"
            onClick={() =>
              void sourceVideoFromGallery(image.id).then((ok) => ok && onGo("generate"))
            }
          >
            Continue it
          </Button>
        ) : null}
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
  // Said by "Added from" instead: Civitai only shows what its poster shared.
  civitai: null,
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
