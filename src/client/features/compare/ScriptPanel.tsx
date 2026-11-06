/**
 * The Scripts block with Compare picked: Compare has its own view, so the block only opens it,
 * makes a comparison from the current settings, and shows the comparisons that are running (or
 * the latest few), each opening its results.
 */

import { useGoToView } from "@client/lib/hooks";
import { followTopic } from "@client/lib/live";
import { useCompareTasks } from "@client/lib/queries";
import { Button, ProgressBar } from "@client/ui";
import type { CompareTask } from "@shared/compare";
import { useEffect } from "react";
import { newComparison } from "./actions";
import { useCompareUi, useTaskPlan } from "./state";

export function CompareScriptPanel() {
  useEffect(() => followTopic("compare"), []);
  const go = useGoToView();
  const tasks = useCompareTasks().data ?? [];
  const running = tasks.filter((t) => t.running);
  const shown = running.length ? running : tasks.slice(0, 3);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-fg-3">
        Try every combination of a few settings (samplers × schedulers × CFG…) with one seed, and
        compare the results in a grid.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" icon="compare" onClick={() => go("compare")}>
          Open Compare
        </Button>
        <Button
          size="sm"
          icon="plus"
          onClick={() => void newComparison().then((t) => t && go("compare"))}
        >
          New from these settings
        </Button>
      </div>
      {shown.length ? (
        <div className="flex flex-col gap-1">
          <span className="label-caps text-fg-4">{running.length ? "Running" : "Latest"}</span>
          {shown.map((t) => (
            <TaskLine
              key={t.id}
              task={t}
              onOpen={() => {
                useCompareUi.getState().select(t.id, t.results.length ? "results" : "setup");
                go("compare");
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskLine({ task, onOpen }: { task: CompareTask; onOpen: () => void }) {
  const { title, plan } = useTaskPlan(task);
  const total = plan?.cells.length ?? task.results.length;
  const made = task.results.filter((r) => r.state === "done").length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2 focus-ring"
    >
      <span className="flex items-center gap-2 text-xs">
        <span className="truncate text-fg-2">{title}</span>
        <span className="ml-auto shrink-0 text-fg-4 tabular">
          {Math.min(made, total)}/{total}
        </span>
      </span>
      {task.running ? (
        <ProgressBar value={total ? made / total : 0} label="Images made" size="sm" />
      ) : null}
    </button>
  );
}
