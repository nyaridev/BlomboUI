/** Placeholder for views that land in later phases, so navigation can be reviewed end to end. */
import { Icon, type IconName } from "@client/icons/Icon";
import type { ViewId } from "@shared/constants";

const INFO: Partial<
  Record<ViewId, { icon: IconName; title: string; phase: string; text: string }>
> = {
  wildcards: {
    icon: "wildcards",
    title: "Wildcard Manager",
    phase: "Phase 2",
    text: "File tree, YAML editor with folding, lint and reference autocomplete, roll preview.",
  },
  "file-info": {
    icon: "file-info",
    title: "File Info",
    phase: "Phase 2",
    text: "PNG info, safetensors metadata, Civitai lookup, and importing workflows embedded in images.",
  },
  history: {
    icon: "history",
    title: "History",
    phase: "Phase 3",
    text: "Downloads, Civitai browsing and generation history.",
  },
  errors: {
    icon: "errors",
    title: "Errors",
    phase: "Phase 1",
    text: "Every error with details, copy and clear. The header badge links here.",
  },
  scopes: {
    icon: "scopes",
    title: "Scopes",
    phase: "Phase 5",
    text: "Thumbnail scopes, groups and lookup, with a smoother editor.",
  },
  help: {
    icon: "book",
    title: "Help & prompt guide",
    phase: "Phase 5",
    text: "Getting started, loading models, importing workflows, and the prompt syntax guide with a playground.",
  },
};

export function ComingSoon({ view }: { view: ViewId }) {
  const info = INFO[view] ?? { icon: "sparkle" as IconName, title: view, phase: "Later", text: "" };
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl border border-line bg-surface text-accent-ink">
          <Icon name={info.icon} size={28} />
        </span>
        <div className="flex flex-col gap-1.5">
          <span className="label-caps">{info.phase}</span>
          <h2 className="text-xl font-semibold text-fg">{info.title}</h2>
          <p className="text-sm text-fg-3">{info.text}</p>
        </div>
      </div>
    </div>
  );
}
