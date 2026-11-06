/**
 * Wildcard info, from a wildcards grid (a card's info button or right-click, or a click in
 * Models → Wildcards → View): where the wildcard is defined, how many entries it has and the
 * first few, its picture (set from a file or the latest result, or removed; it applies at once and
 * the old one goes to the profile's trash), and Open in the editor (Models → Wildcards → Editor).
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useGoToView } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import { qk, useWildcardInfo, useWildcards } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Button, Dialog, FallbackFace, Menu, Skeleton, toast } from "@client/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { latestResult } from "../models/ModelInfoDialog";
import { useModelsNav } from "../models/nav";
import { useWildcardUi } from "../wildcards/state";

/** Open a wildcard file (its editor path) in Models → Wildcards → Editor. */
export function useEditWildcard(): (path: string) => void {
  const go = useGoToView();
  return (path) => {
    useWildcardUi.getState().setOpen(path);
    useModelsNav.getState().showWildcards("editor");
    go("models");
  };
}

export function WildcardInfoDialog({
  name,
  onClose,
}: {
  name: string | null;
  onClose: () => void;
}) {
  const info = useWildcardInfo(name);
  const edit = useEditWildcard();
  const d = info.data;
  const picture = useWildcards().data?.pictures[name ?? ""] ?? null;
  return (
    <Dialog
      open={name !== null}
      onOpenChange={(o) => !o && onClose()}
      title={name ? `__${name}__` : "Wildcard"}
      description={
        d
          ? `${d.count} ${d.count === 1 ? "entry" : "entries"} · ${d.path.slice(d.path.indexOf("/") + 1)} in ${d.folder}`
          : undefined
      }
      width={620}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            icon="edit"
            disabled={!d}
            onClick={() => {
              if (!d) return;
              onClose();
              edit(d.path);
            }}
          >
            Open in the editor
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-5 max-sm:grid-cols-1">
        {name ? <PictureBox name={name} picture={picture} /> : null}
        <div className="min-w-0">
          {info.isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ) : info.error ? (
            <p className="flex items-start gap-2 text-sm text-danger">
              <Icon name="errors" size={15} className="mt-0.5 shrink-0" />
              {info.error.message}
            </p>
          ) : d ? (
            <div className="flex flex-col gap-2">
              <span className="label-caps">
                {d.count > d.sample.length ? `First ${d.sample.length} entries` : "Entries"}
              </span>
              {d.sample.length ? (
                <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-sunken">
                  {d.sample.map((line, i) => (
                    // Entries can repeat, so the position keeps keys apart.
                    <li
                      key={`${i}:${line}`}
                      className="truncate px-3 py-1.5 font-mono text-xs text-fg-2"
                      title={line}
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-3">It has no entries yet.</p>
              )}
              {d.count > d.sample.length ? (
                <p className="text-xs text-fg-3">…and {d.count - d.sample.length} more.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

/** The wildcard's picture, 2:3, with a menu to set it from a file or the latest result. */
function PictureBox({ name, picture }: { name: string; picture: string | null }) {
  const qc = useQueryClient();
  const profileId = useSession((s) => s.profileId);
  const latest = useLive((s) => latestResult(s.queue.jobs));
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const apply = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      await qc.invalidateQueries({ queryKey: qk.wildcards(profileId) });
      toast(done, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const set = (image: Blob) =>
    void apply(() => api.setWildcardPicture(name, image), "Picture set.");
  const fromLatest = async () => {
    if (!latest) return;
    const res = await fetch(latest).catch(() => null);
    if (!res?.ok) {
      toast("Couldn't load the latest result. Is ComfyUI still running?", "error");
      return;
    }
    set(await res.blob());
  };
  return (
    <div className="flex flex-col gap-2 max-sm:hidden">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-line bg-sunken">
        {picture ? (
          <img src={picture} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <FallbackFace kind="wildcards" className="absolute inset-0" />
        )}
      </div>
      <Menu
        placement="bottom-start"
        width={230}
        trigger={
          <Button size="sm" icon="image" iconRight="chevron-down" loading={busy} className="w-full">
            {picture ? "Change picture" : "Set picture"}
          </Button>
        }
        items={[
          {
            id: "file",
            label: "From a file…",
            icon: "upload",
            onSelect: () => file.current?.click(),
          },
          {
            id: "latest",
            label: "From the latest result",
            icon: "generate",
            disabled: !latest,
            onSelect: () => void fromLatest(),
          },
          { type: "separator", id: "s" },
          {
            id: "remove",
            label: "Remove picture",
            icon: "trash",
            tone: "danger",
            disabled: !picture,
            onSelect: () =>
              void apply(
                () => api.removeWildcardPicture(name),
                "Picture removed. It's in the profile's trash.",
              ),
          },
        ]}
      />
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) set(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
