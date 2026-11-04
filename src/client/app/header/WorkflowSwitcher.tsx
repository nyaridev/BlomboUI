/**
 * The header's workflow button: a split button. The main part shows the workflow on screen and
 * opens the workflows window (WorkflowBrowser) in the middle of the screen; the attached icon
 * button opens it in ComfyUI.
 */
import { editInComfy } from "@client/features/generate/bridge";
import { useActiveWorkflow } from "@client/features/generate/workflow";
import { Icon } from "@client/icons/Icon";
import { useWorkflows } from "@client/lib/queries";
import { IconButton } from "@client/ui";
import { useState } from "react";
import { WorkflowBrowser, WorkflowPicture } from "./WorkflowBrowser";

export function WorkflowSwitcher() {
  const current = useActiveWorkflow().manifest;
  const [open, setOpen] = useState(false);
  const listed = useWorkflows().data?.find((w) => w.id === current?.id);
  const picture = listed ?? (current ? { id: current.id, thumb: null } : null);
  const name = current?.name ?? "No workflow";
  // "SDXL" next to a workflow called "SDXL" says nothing.
  const family = !current
    ? "Add one"
    : current.name.toLowerCase().includes(current.family.toLowerCase())
      ? null
      : current.family;

  return (
    <>
      <div className="flex h-9 min-w-0 max-w-[340px] items-stretch rounded-lg border border-line bg-field">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={`Workflow: ${name}. Show all workflows`}
          className="group flex min-w-0 items-center gap-2 rounded-l-lg pr-2.5 pl-1.5 transition-colors hover:bg-surface-3 focus-ring"
        >
          <WorkflowPicture workflow={picture} className="h-6 w-6 shrink-0 rounded-md" />
          <span className="truncate text-sm font-medium text-fg">{name}</span>
          {family ? <span className="shrink-0 text-xs text-fg-3">{family}</span> : null}
          <Icon
            name="chevron-down"
            size={14}
            className="shrink-0 text-fg-3 group-hover:text-fg-2"
          />
        </button>
        <span className="w-px bg-line" />
        <IconButton
          icon="external"
          label="Edit in ComfyUI"
          size="sm"
          disabled={!current}
          onClick={() => current && void editInComfy(current.id)}
          className="h-auto rounded-l-none rounded-r-lg"
        />
      </div>
      <WorkflowBrowser open={open} onOpenChange={setOpen} />
    </>
  );
}
