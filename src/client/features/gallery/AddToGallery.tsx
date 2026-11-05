/**
 * Add to gallery: a Civitai image (the server downloads its original file and keeps what Civitai
 * says about it beside it) or an image file from your PC. The Civitai images added in this window
 * are remembered by their key, so every button showing one (a tile, the carousel, the viewer)
 * says it's in the gallery. Images dropped (or pasted) on the gallery are added too. A toast after
 * adding offers to show it there.
 */
import { router } from "@client/app/router";
import { useAddCivitaiImage, useAddImageFile } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Button, IconButton, toast } from "@client/ui";
import type { CivitaiImage } from "@shared/civitai";
import { type AddedImage, IMAGE_EXTENSIONS, type ImageOrigin } from "@shared/gallery";
import { create } from "zustand";
import { usePageFileDrop } from "../fileinfo/PageDrop";
import { useGalleryUi } from "./state";

/** Civitai image key → its gallery image id, for the images added in this window. */
const useAdded = create<Record<string, number>>(() => ({}));

function showInGallery(origin: ImageOrigin, id: number) {
  const profileId = useSession.getState().profileId;
  if (!profileId) return;
  useGalleryUi.getState().show({ origins: [origin], open: id });
  void router.navigate({ to: "/p/$profileId/$view", params: { profileId, view: "gallery" } });
}

function announce(r: AddedImage, from: string) {
  toast(
    r.already
      ? `That image is already in your gallery (${from}).`
      : `Added to your gallery (${from}).`,
    "success",
    { label: "Show", run: () => showInGallery(r.image.origin, r.image.id) },
  );
}

/**
 * The Civitai image's button: an icon over the picture. `onDark` for a button on the image
 * itself (tiles, the full-screen viewer), else a raised secondary one (the carousel).
 */
export function AddCivitaiImage({
  image,
  versionId,
  onDark = false,
  size = "sm",
}: {
  image: CivitaiImage;
  /** The model version whose images these are. */
  versionId: number;
  onDark?: boolean;
  size?: "xs" | "sm" | "md";
}) {
  const add = useAddCivitaiImage();
  const key = image.key;
  const added = useAdded((s) => (key ? s[key] : undefined));
  if (!key || image.video) return null;
  return (
    <IconButton
      icon={added !== undefined ? "check" : "download"}
      label={added !== undefined ? "In your gallery: show it" : "Add to gallery"}
      size={size}
      variant={onDark ? "overlay" : "secondary"}
      loading={add.isPending}
      className={onDark ? undefined : "rounded-md shadow-pop"}
      onClick={(e) => {
        e.stopPropagation();
        if (added !== undefined) return showInGallery("civitai", added);
        // The promise, not onSuccess: a tile can scroll away (unmount) while it downloads.
        add
          .mutateAsync({ versionId, key, id: image.id })
          .then((r) => {
            useAdded.setState({ [key]: r.image.id });
            announce(r, "From Civitai");
          })
          .catch((err: Error) => toast(err.message, "error"));
      }}
    />
  );
}

/** A dropped image file's button (File info). */
export function AddImageFile({ file }: { file: File }) {
  const add = useAddImageFile();
  return (
    <Button
      icon="download"
      loading={add.isPending}
      onClick={() =>
        add
          .mutateAsync(file)
          .then((r) => announce(r, "From your PC"))
          .catch((err: Error) => toast(err.message, "error"))
      }
    >
      Add to gallery
    </Button>
  );
}

const isImage = (f: File) =>
  f.type.startsWith("image/") || IMAGE_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext));

/**
 * Images dropped or pasted anywhere on the gallery while it's on screen are added (From your PC),
 * one after another. Returns whether files are being dragged over it (for the overlay).
 */
export function useGalleryDrop(enabled: boolean): boolean {
  const add = useAddImageFile();
  return usePageFileDrop((files) => {
    const images = files.filter(isImage);
    if (!images.length) {
      toast("Drop PNG, JPEG or WebP images to add them to the gallery.", "warning");
      return;
    }
    void (async () => {
      let added = 0;
      let last: AddedImage | null = null;
      const failed: string[] = [];
      for (const file of images)
        try {
          last = await add.mutateAsync(file);
          if (!last.already) added++;
        } catch (err) {
          failed.push(`${file.name}: ${err instanceof Error ? err.message : err}`);
        }
      if (failed.length)
        toast(
          `Couldn't add ${failed.length === 1 ? failed[0] : `${failed.length} images (${failed[0]})`}`,
          "error",
        );
      if (!last) return;
      if (images.length === 1) return announce(last, "From your PC");
      const there = images.length - failed.length - added;
      toast(
        `Added ${added} image${added === 1 ? "" : "s"} to your gallery (From your PC)${there ? `; ${there} ${there === 1 ? "was" : "were"} already there` : ""}.`,
        "success",
        { label: "Show", run: () => showInGallery("imported", (last as AddedImage).image.id) },
      );
    })();
  }, enabled);
}
