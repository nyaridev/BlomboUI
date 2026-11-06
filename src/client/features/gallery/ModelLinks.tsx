/**
 * The lightbox's model and LoRA names, each a link to the model: File info when it's in your
 * models folder (by the hash the image recorded, its Civitai version, else its file name), else its Civitai page when the
 * image says which model it is (names from Civitai's generator), else a Civitai search for the
 * name. Civitai opens in the app or on the site (`useCivitaiOpener`); the icon after a name says
 * where it goes.
 */
import type { IconName } from "@client/icons/Icon";
import { Icon } from "@client/icons/Icon";
import { useLocalModels } from "@client/lib/queries";
import { Tooltip } from "@client/ui";
import { type CivitaiRef, type ImageSummary, modelKey } from "@shared/imageinfo";
import type { LocalModel } from "@shared/models";
import { useFileInfoTarget } from "../fileinfo/state";
import { useCivitaiOpener } from "../models/civitai/open";

type Kind = "model" | "lora";

/**
 * The local model a name stands for: by hash first (found after a rename), then the Civitai
 * version, then the file name.
 */
export function findLocalModel(
  models: LocalModel[],
  name: string,
  kind: Kind,
  ref: CivitaiRef | undefined,
  hash?: string,
): LocalModel | null {
  const kinds: LocalModel["kind"][] =
    kind === "lora" ? ["loras"] : ["checkpoints", "diffusion_models"];
  const ofKind = models.filter((m) => kinds.includes(m.kind));
  const key = modelKey(name);
  return (
    (hash && ofKind.find((m) => m.sha256 === hash.toUpperCase())) ||
    (ref && ofKind.find((m) => m.civitai?.versionId === ref.versionId)) ||
    ofKind.find((m) => modelKey(m.file) === key) ||
    null
  );
}

export function ModelLinks({
  summary,
  kind,
  onFileInfo,
  onLeave,
}: {
  summary: ImageSummary;
  kind: Kind;
  /** Show File info (closes the lightbox). */
  onFileInfo: () => void;
  /** Called before the app switches to Models → Civitai (closes the lightbox). */
  onLeave: () => void;
}) {
  const names =
    kind === "model"
      ? summary.model
        ? [{ name: summary.model, strength: null }]
        : []
      : summary.loras;
  const local = useLocalModels(names.length > 0).data?.models ?? [];
  const setFileInfo = useFileInfoTarget((s) => s.set);
  const civitai = useCivitaiOpener();
  if (!names.length) return null;

  return (
    <span className="flex min-w-0 flex-wrap gap-x-2.5 gap-y-1">
      {names.map((n, i) => {
        const ref = summary.civitai[n.name];
        const model = findLocalModel(local, n.name, kind, ref, summary.hashes[n.name]);
        const leaves = !model && !civitai.inApp;
        const [icon, hint, open]: [IconName, string, () => void] = model
          ? [
              "file-info",
              "Show in File info",
              () => {
                setFileInfo({ type: "model", id: model.id, name: model.name });
                onFileInfo();
              },
            ]
          : ref
            ? [
                leaves ? "external" : "globe",
                leaves ? "Open its page on Civitai" : "Open in Models → Civitai",
                () => {
                  if (!leaves) onLeave();
                  civitai.model({ ...ref, name: n.name });
                },
              ]
            : [
                leaves ? "external" : "search",
                leaves ? "Search for it on Civitai" : "Search for it in Models → Civitai",
                () => {
                  if (!leaves) onLeave();
                  civitai.search(n.name);
                },
              ];
        return (
          <Tooltip key={`${n.name}-${i}`} content={hint} placement="top">
            <button
              type="button"
              onClick={open}
              className="group inline-flex min-w-0 items-center gap-1 rounded-sm text-left text-accent-ink hover:underline focus-ring"
            >
              <span className="break-words">{n.name}</span>
              {n.strength !== null ? (
                <span className="text-fg-3 tabular no-underline">{n.strength}</span>
              ) : null}
              <Icon
                name={icon}
                size={12}
                className="shrink-0 text-fg-4 group-hover:text-accent-ink"
              />
            </button>
          </Tooltip>
        );
      })}
    </span>
  );
}
