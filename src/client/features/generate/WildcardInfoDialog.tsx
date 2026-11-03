/**
 * Wildcard info, from the Wildcards picker (a card's info button or right-click): where the
 * wildcard is defined, how many entries it has and the first few, and Edit in Wildcards, which
 * opens its file in the Wildcard Manager.
 */
import { Icon } from "@client/icons/Icon";
import { useGoToView } from "@client/lib/hooks";
import { useWildcardInfo } from "@client/lib/queries";
import { Button, Dialog, Skeleton } from "@client/ui";
import { useWildcardUi } from "../wildcards/state";

/** Open a wildcard file (its Wildcard Manager path) in the Wildcards view. */
export function useEditWildcard(): (path: string) => void {
  const go = useGoToView();
  return (path) => {
    useWildcardUi.getState().setOpen(path);
    go("wildcards");
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
      width={480}
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
            Edit in Wildcards
          </Button>
        </>
      }
    >
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
    </Dialog>
  );
}
