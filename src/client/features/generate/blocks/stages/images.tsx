/**
 * Picking a stage image (ControlNet's units, the first pass's image to image) or video (Continue
 * a video): the gallery picker and the last finished output.
 */
import { useLive } from "@client/lib/live";
import { useGalleryImages } from "@client/lib/queries";
import { Dialog, EmptyState, Spinner, TextField } from "@client/ui";
import { mediaOf } from "@shared/gallery";
import { useState } from "react";

/** The newest finished run's first saved picture (videos can't be a stage image), or null. */
export function useLastOutput() {
  return useLive((s) => {
    for (const j of s.queue.jobs)
      if (j.state === "done") {
        const pictures = j.images.filter((i) => mediaOf(i.filename) === "image");
        const img = pictures.find((i) => i.type === "output") ?? pictures[0];
        if (img) return img;
      }
    return null;
  });
}

/** The newest finished run's saved video, or null. */
export function useLastVideo() {
  return useLive((s) => {
    for (const j of s.queue.jobs)
      if (j.state === "done") {
        const video = j.images.find((i) => i.type === "output" && mediaOf(i.filename) === "video");
        if (video) return video;
      }
    return null;
  });
}

/** Pick an image from the gallery: the newest first, with a search. */
export function GalleryPicker({
  open,
  onOpenChange,
  onPick,
  media = "image",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (id: number) => void;
  media?: "image" | "video";
}) {
  const [q, setQ] = useState("");
  // One page is plenty for picking; search narrows it.
  const images = useGalleryImages({ q, limit: 120, media });
  const items = images.data?.pages[0]?.items ?? [];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={media === "video" ? "Use a video from the gallery" : "Use an image from the gallery"}
      description="It's copied into the profile, so it stays here even if the file moves."
      width={760}
    >
      <div className="flex flex-col gap-3">
        <TextField
          icon="search"
          size="sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onClear={() => setQ("")}
          placeholder="Search prompts and names"
          aria-label="Search the gallery"
        />
        <div className="scroll-quiet grid max-h-[460px] grid-cols-5 gap-1.5 overflow-y-auto">
          {images.isLoading ? (
            <div className="col-span-5 grid h-40 place-items-center">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              className="col-span-5"
              icon="gallery"
              title={media === "video" ? "No videos" : "No images"}
              text={
                q
                  ? "Nothing matches that search."
                  : media === "video"
                    ? "Videos you generate show up here."
                    : "Generated images and gallery folders show up here."
              }
            />
          ) : (
            items.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => onPick(img.id)}
                title={img.name}
                className="group relative aspect-square overflow-hidden rounded-md border border-line bg-sunken focus-ring hover:border-accent-ink/60"
              >
                <img
                  src={img.thumb}
                  alt={img.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                />
              </button>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
