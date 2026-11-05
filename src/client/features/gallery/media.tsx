/**
 * Moving pictures and sound in the gallery. A tile shows its still thumbnail (an animation's first
 * frame, a video's frame, audio's card) and, while it plays, the animated thumbnail or the muted
 * video over it. Animations play on their own while Settings → Gallery says so (on by default),
 * videos only when asked (off by default); either plays while pointed at. The lightbox plays the
 * file itself: animations as an image, videos and audio with their controls.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { useSettings } from "@client/lib/queries";
import { animatedThumbUrl, fileUrl, type GalleryImage, playTime } from "@shared/gallery";

/** A picture (copy, ControlNet and the like work on it), not a video or audio. */
export const stillOrAnimated = (image: GalleryImage) =>
  image.media === "image" || image.media === "animated";

/** Whether a tile's animation or video plays now (it's on by setting, or pointed at). */
export function usePlaying(image: GalleryImage, hovered: boolean): boolean {
  const gallery = useSettings().data?.gallery;
  if (image.media === "animated") return hovered || (gallery?.autoplayAnimated ?? true);
  if (image.media === "video") return hovered || (gallery?.autoplayVideo ?? false);
  return false;
}

/** What plays over a tile's still thumbnail. */
export function TileMotion({ image, playing }: { image: GalleryImage; playing: boolean }) {
  if (!playing) return null;
  if (image.media === "animated")
    return (
      <img
        src={animatedThumbUrl(image)}
        alt=""
        decoding="async"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
    );
  if (image.media === "video")
    return (
      <video
        src={fileUrl(image)}
        muted
        loop
        autoPlay
        playsInline
        preload="auto"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
    );
  return null;
}

const BADGE: Partial<Record<GalleryImage["media"], { icon: IconName; label: string }>> = {
  animated: { icon: "play", label: "Animation" },
  video: { icon: "play", label: "Video" },
  audio: { icon: "wave", label: "Audio" },
};

/** The corner mark of a tile that isn't a still image: what it is and how long it runs. */
export function MediaBadge({ image }: { image: GalleryImage }) {
  const badge = BADGE[image.media];
  if (!badge) return null;
  const ext = image.name.slice(image.name.lastIndexOf(".") + 1).toUpperCase();
  return (
    <span
      className="pointer-events-none absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-xs bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white tabular"
      title={badge.label}
    >
      <Icon name={badge.icon} size={10} />
      {image.duration !== null ? playTime(image.duration) : ext}
    </span>
  );
}

/** The lightbox's player for a video or audio file (animations show as images). */
export function StagePlayer({ image }: { image: GalleryImage }) {
  if (image.media === "video")
    return (
      // biome-ignore lint/a11y/useMediaCaption: generated videos have no captions
      <video
        key={image.id}
        src={fileUrl(image)}
        poster={image.thumb}
        controls
        autoPlay
        loop
        playsInline
        className="max-h-full max-w-full rounded-md bg-black shadow-pop"
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
      />
    );
  if (image.media === "audio")
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border border-line bg-surface p-6 shadow-pop">
        <span className="grid h-16 w-16 place-items-center rounded-xl bg-accent/15 text-accent-ink">
          <Icon name="wave" size={28} />
        </span>
        <span className="max-w-full truncate text-sm font-medium text-fg">{image.name}</span>
        {/* biome-ignore lint/a11y/useMediaCaption: generated audio has no captions */}
        <audio key={image.id} src={fileUrl(image)} controls autoPlay className="w-full" />
      </div>
    );
  return null;
}
