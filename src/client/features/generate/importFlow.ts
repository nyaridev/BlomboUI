/**
 * Importing a ComfyUI workflow from a dropped or chosen file: upload, make it the active
 * workflow, and say what the analyzer found (missing nodes or models first).
 */
import { useImportWorkflow } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { toast } from "@client/ui";
import type { ImportResult } from "@shared/workflow/manifest";
import { type DragEvent, useState } from "react";
import { useActiveChoice } from "./workflow";

const ACCEPT = ".json,.png,.webp,application/json,image/png,image/webp";

function summarize(r: ImportResult): void {
  const problems = r.findings.filter((f) => f.level !== "info");
  const shown = r.workflow.bindings.filter((b) => !b.hidden).length;
  if (problems.length) {
    toast(
      `Imported "${r.workflow.name}" with ${problems.length} thing${problems.length === 1 ? "" : "s"} to fix: ${problems[0]?.message}`,
      "warning",
    );
  } else {
    toast(`Imported "${r.workflow.name}" · ${shown} settings found`, "success");
  }
}

export function useImportFlow(onImported?: (r: ImportResult) => void) {
  const mutation = useImportWorkflow();
  const choose = useActiveChoice((s) => s.choose);
  const [dragging, setDragging] = useState(false);

  const run = (file: File) =>
    mutation.mutate(file, {
      onSuccess: (r) => {
        const profileId = useSession.getState().profileId;
        if (profileId) choose(profileId, r.workflow.id);
        summarize(r);
        onImported?.(r);
      },
      onError: (e) => toast(e.message, "error"),
    });

  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) run(file);
    };
    input.click();
  };

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) run(file);
    },
  };

  return { pickFile, dropProps, dragging, busy: mutation.isPending };
}
