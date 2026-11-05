/**
 * The bar floating at the bottom of the window while images are picked (selection.ts), so the
 * list never moves under the pointer between clicks: how many, Select all
 * (everything loaded), Move to trash (Undo in the toast) and Clear. Keys while the list is on
 * screen and the lightbox closed: Delete moves the picked images to the trash, Esc clears,
 * Ctrl+A picks everything loaded. Typing in a field is left alone.
 */
import { api } from "@client/lib/api";
import { useTrashImages } from "@client/lib/queries";
import { Button, toast } from "@client/ui";
import { useEffect } from "react";
import { useSelection } from "./selection";

export function SelectionBar({ order, active }: { order: number[]; active: boolean }) {
  const count = useSelection((s) => s.ids.size);
  const trash = useTrashImages();

  const remove = () => {
    const ids = [...useSelection.getState().ids];
    if (!ids.length) return;
    void trash
      .mutateAsync(ids)
      .then((r) => {
        useSelection.getState().clear();
        const n = r.ids.length;
        toast(`Moved ${n} ${n === 1 ? "image" : "images"} to the trash`, "success", {
          label: "Undo",
          run: () => void api.restoreImages(r.ids).catch((e: Error) => toast(e.message, "error")),
        });
      })
      .catch((e: Error) => toast(e.message, "error"));
  };
  const latest = { remove, order };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.defaultPrevented || t?.closest("input, textarea, [contenteditable=true]")) return;
      const sel = useSelection.getState();
      if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sel.set(latest.order);
      } else if (e.key === "Escape" && sel.ids.size) {
        e.preventDefault();
        sel.clear();
      } else if (e.key === "Delete" && sel.ids.size) {
        e.preventDefault();
        latest.remove();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!count || !active) return null;
  return (
    <div className="fixed bottom-5 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-line-strong bg-surface-3 py-1.5 pr-1.5 pl-4 shadow-pop max-lg:bottom-20">
      <span className="text-sm whitespace-nowrap text-fg tabular">
        {count.toLocaleString()} {count === 1 ? "image" : "images"} selected
      </span>
      <span className="hidden text-2xs whitespace-nowrap text-fg-3 xl:inline">
        Ctrl+click adds one, Shift+click a range
      </span>
      <span className="ml-2 flex items-center gap-1.5">
        {count < order.length ? (
          <Button size="sm" variant="ghost" onClick={() => useSelection.getState().set(order)}>
            Select all {order.length.toLocaleString()}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => useSelection.getState().clear()}>
          Clear
        </Button>
        <Button size="sm" variant="danger" icon="trash" loading={trash.isPending} onClick={remove}>
          Move to trash
        </Button>
      </span>
    </div>
  );
}
