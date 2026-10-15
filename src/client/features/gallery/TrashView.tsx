/**
 * Trash: images removed from the gallery, kept in the profile's trash folder until it's
 * emptied. Restore puts a file back where it was (with a new name if that spot is taken).
 */
import { formatBytes } from "@client/lib/number";
import { useEmptyTrash, useGalleryTrash, useRestoreImages } from "@client/lib/queries";
import { Button, Dialog, EmptyState, IconButton, Skeleton, toast } from "@client/ui";
import { useState } from "react";

export function TrashView() {
  const trash = useGalleryTrash();
  const restore = useRestoreImages();
  const empty = useEmptyTrash();
  const [confirm, setConfirm] = useState(false);
  const items = trash.data ?? [];
  const bytes = items.reduce((n, i) => n + i.size, 0);

  const restoreIds = (ids: string[]) =>
    restore.mutate(ids, {
      onSuccess: (r) =>
        toast(`Restored ${r.restored} ${r.restored === 1 ? "image" : "images"}`, "success"),
      onError: (e) => toast(e.message, "error"),
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-5 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-fg">Trash</span>
          <span className="text-xs text-fg-3">
            Removed images wait here until you empty the trash.
            {items.length ? ` ${plural(items.length)} · ${formatBytes(bytes)}` : ""}
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            icon="restore"
            disabled={!items.length}
            loading={restore.isPending}
            onClick={() => restoreIds(items.map((i) => i.id))}
          >
            Restore all
          </Button>
          <Button
            variant="danger"
            icon="trash"
            disabled={!items.length}
            onClick={() => setConfirm(true)}
          >
            Empty trash
          </Button>
        </div>
      </div>
      {trash.isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 p-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="trash"
          title="The trash is empty"
          text="Images you remove from the gallery land here, so you can put them back."
        />
      ) : (
        <div className="scroll-quiet grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 overflow-y-auto p-5">
          {items.map((t) => (
            <div key={t.id} className="group flex flex-col gap-1.5">
              <div className="relative aspect-square overflow-hidden rounded-md bg-sunken">
                <img
                  src={t.thumb}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover opacity-80"
                />
                <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <IconButton
                    icon="restore"
                    label="Restore"
                    variant="secondary"
                    size="sm"
                    onClick={() => restoreIds([t.id])}
                  />
                </div>
              </div>
              <span className="truncate text-xs text-fg-2" title={t.path}>
                {t.name}
              </span>
              <span className="text-2xs text-fg-4">
                Removed {new Date(t.trashedAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Empty the trash?"
        description={`${plural(items.length)} (${formatBytes(bytes)}) will be deleted for good. This can't be undone.`}
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep them
            </Button>
            <Button
              variant="danger"
              icon="trash"
              loading={empty.isPending}
              onClick={() =>
                empty.mutate(undefined, {
                  onSuccess: (r) => {
                    toast(
                      `Deleted ${r.deleted} ${r.deleted === 1 ? "image" : "images"} for good`,
                      "success",
                    );
                    setConfirm(false);
                  },
                  onError: (e) => toast(e.message, "error"),
                })
              }
            >
              Delete for good
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-2">
          Only Blombo's own trash folder is emptied. Nothing else in your folders is touched.
        </p>
      </Dialog>
    </div>
  );
}

function plural(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? "image" : "images"}`;
}
