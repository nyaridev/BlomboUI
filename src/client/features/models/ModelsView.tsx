/**
 * Models: Local · Civitai · Manager. One ModelCard everywhere. Local runs on the profile's
 * models folder (LocalModels.tsx), Civitai is the in-app browser with model tabs
 * (civitai/CivitaiView.tsx), Manager is the ComfyUI model catalog as a store (ManagerStore.tsx).
 * Which tab is open lives in nav.ts so other views can deep-link here.
 */
import { formatBytes } from "@client/lib/number";
import { useLocalModels } from "@client/lib/queries";
import { Tabs } from "@client/ui";
import { CivitaiView } from "./civitai/CivitaiView";
import { LocalModels } from "./LocalModels";
import { ManagerStore } from "./ManagerStore";
import { useModelsNav } from "./nav";

export function ModelsView() {
  const sub = useModelsNav((s) => s.tab);
  const setSub = useModelsNav((s) => s.setTab);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-line px-5 pt-2 max-lg:px-3">
        <Tabs
          variant="line"
          value={sub}
          onChange={setSub}
          label="Models"
          items={[
            { value: "local", label: "Local", icon: "folder" },
            { value: "civitai", label: "Civitai", icon: "globe" },
            { value: "manager", label: "Manager", icon: "store" },
          ]}
          className="border-b-0"
        />
        <FolderSummary />
      </div>
      {sub === "local" ? <LocalModels /> : sub === "civitai" ? <CivitaiView /> : <ManagerStore />}
    </div>
  );
}

/** "B:\Models +1 · 1,284 files · 412 GB" for the open profile (main folder + how many more). */
function FolderSummary() {
  const list = useLocalModels().data;
  if (!list?.root) return null;
  const more = list.folders.length - 1;
  return (
    <span
      className="ml-auto truncate pb-1.5 font-mono text-xs text-fg-3 max-lg:hidden"
      title={list.folders.map((f) => f.path).join("\n")}
    >
      {list.root}
      {more > 0 ? ` +${more}` : ""} · {list.models.length.toLocaleString()} files ·{" "}
      {formatBytes(list.totalSize)}
    </span>
  );
}
