/**
 * A gallery image's right-click menu: the lightbox's actions (open, favorite, use its settings,
 * File Info, Explorer, copy, ControlNet, trash with Undo) without opening it first.
 */
import { api } from "@client/lib/api";
import { useFavorite, useTrashImages } from "@client/lib/queries";
import { type MenuEntry, toast } from "@client/ui";
import { fileUrl, type GalleryImage } from "@shared/gallery";
import { useFileInfoTarget } from "../fileinfo/state";
import { applyImageSettings } from "../generate/applySettings";
import { controlImageFromGallery } from "../generate/blocks/stages";

/** Put the image on the clipboard as PNG (the only image type browsers accept there). */
export async function copyImage(image: GalleryImage): Promise<void> {
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
}

export function useImageMenu(
  onOpen: (id: number) => void,
  onGo: (view: "generate" | "file-info") => void,
) {
  const favorite = useFavorite();
  const trash = useTrashImages();
  const setFileInfo = useFileInfoTarget((s) => s.set);
  return (image: GalleryImage): MenuEntry[] => [
    { id: "open", label: "Open", icon: "maximize", onSelect: () => onOpen(image.id) },
    {
      id: "favorite",
      label: image.favorite ? "Remove from favorites" : "Add to favorites",
      icon: "heart",
      onSelect: () => favorite.mutate({ ids: [image.id], favorite: !image.favorite }),
    },
    { type: "separator", id: "s1" },
    {
      id: "settings",
      label: "Use these settings",
      icon: "generate",
      onSelect: () =>
        void api
          .galleryImage(image.id)
          .then((d) => applyImageSettings(d.settings, d.summary.seed))
          .then((ok) => ok && onGo("generate"))
          .catch((e: Error) => toast(e.message, "error")),
    },
    {
      id: "controlnet",
      label: "Use for ControlNet",
      icon: "pose",
      onSelect: () => void controlImageFromGallery(image.id).then((ok) => ok && onGo("generate")),
    },
    { type: "separator", id: "s2" },
    {
      id: "file-info",
      label: "File info",
      icon: "file-info",
      onSelect: () => {
        setFileInfo({ type: "gallery", id: image.id, name: image.name });
        onGo("file-info");
      },
    },
    {
      id: "reveal",
      label: "Show in Explorer",
      icon: "folder-open",
      onSelect: () => void api.revealImage(image.id).catch((e: Error) => toast(e.message, "error")),
    },
    { id: "copy", label: "Copy image", icon: "copy", onSelect: () => void copyImage(image) },
    { type: "separator", id: "s3" },
    {
      id: "trash",
      label: "Move to trash",
      icon: "trash",
      tone: "danger",
      onSelect: () =>
        void trash
          .mutateAsync([image.id])
          .then((r) =>
            toast(`Moved "${image.name}" to the trash`, "success", {
              label: "Undo",
              run: () =>
                void api.restoreImages(r.ids).catch((e: Error) => toast(e.message, "error")),
            }),
          )
          .catch((e: Error) => toast(e.message, "error")),
    },
  ];
}
