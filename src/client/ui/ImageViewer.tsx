/**
 * A full-screen look at one image, or a few (a run's results): the picture as large as it fits
 * on black, nothing else. Esc or a click beside the picture closes it, ← → step through the
 * images, a middle click on the picture opens it in a new tab (`onOpenTab`). It sits on the
 * lightbox layer (z 250).
 */
import { cn } from "@client/lib/cn";
import { useModalFocus } from "@client/lib/hooks";
import { type MouseEvent, useEffect, useRef } from "react";
import { IconButton } from "./Button";

export interface ViewerImage {
  key: string;
  src: string;
  alt: string;
}

export function ImageViewer({
  images,
  index,
  onIndex,
  onClose,
  onOpenTab,
}: {
  images: ViewerImage[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onOpenTab?: (image: ViewerImage) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref);
  const image = images[index] ?? images[0];
  const many = images.length > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (many && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const step = e.key === "ArrowLeft" ? -1 : 1;
        onIndex((index + step + images.length) % images.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, many, onClose, onIndex]);

  if (!image) return null;
  const middle = (e: MouseEvent) => {
    if (e.button !== 1 || !onOpenTab) return;
    e.preventDefault();
    onOpenTab(image);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={image.alt}
      className="fixed inset-0 z-[250] grid place-items-center bg-black/94 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={() => undefined}
    >
      <img
        key={image.key}
        src={image.src}
        alt={image.alt}
        onMouseDown={(e) => {
          // Keep the browser's autoscroll from starting on a middle click.
          if (e.button === 1) e.preventDefault();
        }}
        onAuxClick={middle}
        className="max-h-full max-w-full object-contain"
      />
      <div className="absolute top-3 right-3">
        <IconButton
          icon="x"
          label="Close"
          shortcut="Esc"
          onClick={onClose}
          className="text-white/80 hover:bg-white/10 hover:text-white"
        />
      </div>
      {many ? (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1">
          {images.map((img, i) => (
            <button
              key={img.key}
              type="button"
              aria-label={`Image ${i + 1} of ${images.length}`}
              aria-current={i === index}
              onClick={() => onIndex(i)}
              className={cn(
                "h-1.5 rounded-full transition-[width,background-color] focus-ring",
                i === index ? "w-5 bg-white" : "w-1.5 bg-white/35 hover:bg-white/60",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
