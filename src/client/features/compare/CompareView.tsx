/**
 * Compare (a view of Generate's, from the header's Generate menu or the Compare script): saved
 * comparisons on the left, the open one on the right with its setup (what it starts from, the
 * settings to compare and their values) and its results (the grid). A comparison lists here
 * whichever workflow it was made from. Below 1024 px the list becomes a picker on top.
 */
import { cn } from "@client/lib/cn";
import { followTopic } from "@client/lib/live";
import { useCompareTasks } from "@client/lib/queries";
import {
  Button,
  EmptyState,
  IconButton,
  InlineInput,
  Menu,
  ProgressBar,
  Segmented,
  Select,
  Skeleton,
} from "@client/ui";
import { type CompareTask, compareTitle } from "@shared/compare";
import { useEffect, useState } from "react";
import { cloneComparison, newComparison, removeComparison, updateComparison } from "./actions";
import { type ComparePage, useCompareUi, useTaskPlan } from "./state";
import { TaskResults } from "./TaskResults";
import { TaskSetup } from "./TaskSetup";

export function CompareView() {
  useEffect(() => followTopic("compare"), []);
  const tasks = useCompareTasks();
  const selected = useCompareUi((s) => s.selected);
  const list = tasks.data ?? [];
  const task = list.find((t) => t.id === selected) ?? list[0];

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface max-lg:hidden">
        <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
          <h2 className="label-caps text-fg-3">Comparisons</h2>
          <Button size="sm" icon="plus" onClick={() => void newComparison()}>
            New
          </Button>
        </div>
        <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3">
          {tasks.isLoading ? (
            <>
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </>
          ) : list.length ? (
            list.map((t) => <TaskRow key={t.id} task={t} active={t.id === task?.id} />)
          ) : (
            <p className="px-2 py-3 text-xs text-fg-3">
              None yet. New makes one from Generate's current settings.
            </p>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {task ? (
          <TaskPage key={task.id} task={task} all={list} />
        ) : tasks.isLoading ? null : (
          <EmptyState
            className="m-auto max-w-md"
            icon="compare"
            title="Compare settings side by side"
            text="Pick a few settings (samplers, schedulers, CFG, models, LoRAs, a word in the prompt…) and the values to try. Every combination is made with the same seed, then laid out in a grid you can zoom, flip through and compare two at a time."
            action={
              <Button variant="primary" icon="plus" onClick={() => void newComparison()}>
                New comparison from Generate's settings
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, active }: { task: CompareTask; active: boolean }) {
  const { title, plan } = useTaskPlan(task);
  const total = plan?.cells.length ?? task.results.length;
  const keys = new Set(plan?.cells.map((c) => c.key));
  const made = task.results.filter((r) => r.state === "done" && (!plan || keys.has(r.key))).length;
  return (
    <button
      type="button"
      onClick={() => useCompareUi.getState().select(task.id)}
      aria-current={active || undefined}
      className={cn(
        "flex flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-colors focus-ring",
        active ? "bg-field" : "hover:bg-surface-2",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {task.running ? (
          <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent-ink" />
        ) : null}
        <span className={cn("truncate text-sm", active ? "text-fg" : "text-fg-2")}>{title}</span>
      </span>
      <span className="flex items-center gap-2 text-2xs text-fg-4">
        <span className="truncate">{task.workflowName}</span>
        <span className="ml-auto shrink-0 tabular">
          {task.running ? "Running · " : ""}
          {made}/{total}
        </span>
      </span>
      {task.running ? (
        <ProgressBar value={total ? made / total : 0} label="Images made" size="sm" />
      ) : null}
    </button>
  );
}

function TaskPage({ task, all }: { task: CompareTask; all: CompareTask[] }) {
  const { title, plan, bindings } = useTaskPlan(task);
  const page = useCompareUi((s) => s.page[task.id]) ?? (task.results.length ? "results" : "setup");
  const setPage = (p: ComparePage) => useCompareUi.getState().setPage(task.id, p);
  const [name, setName] = useState(task.name);
  useEffect(() => setName(task.name), [task.name]);
  const saveName = () => {
    if (name.trim() !== task.name) void updateComparison(task.id, { name: name.trim() });
  };

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2.5 max-lg:px-3">
        {/* Narrow screens: the list as a picker. */}
        <div className="flex w-full items-center gap-2 lg:hidden">
          <Select
            size="sm"
            label="Comparison"
            value={task.id}
            options={all.map((t) => ({ value: t.id, label: compareTitle(t, bindings) }))}
            onChange={(id) => useCompareUi.getState().select(id)}
            className="min-w-0 flex-1"
          />
          <IconButton icon="plus" label="New comparison" onClick={() => void newComparison()} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <InlineInput
            mono={false}
            size="lg"
            aria-label="Name"
            value={name}
            placeholder={title}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setName(task.name);
                e.currentTarget.blur();
              }
            }}
            className="-ml-2 font-medium"
          />
          <span className="text-xs text-fg-3">
            {task.workflowName}
            {plan ? ` · ${plan.cells.length} image${plan.cells.length === 1 ? "" : "s"}` : ""}
            {task.seed !== null && !task.randomSeeds ? ` · seed ${task.seed}` : ""}
          </span>
        </div>
        <Segmented
          size="sm"
          label="Page"
          value={page}
          onChange={setPage}
          options={[
            { value: "setup", label: "Setup" },
            { value: "results", label: "Results" },
          ]}
        />
        <Menu
          items={[
            {
              id: "clone",
              label: "Clone as new",
              icon: "duplicate",
              hint: "Same settings, not started",
              onSelect: () => void cloneComparison(task.id),
            },
            { type: "separator", id: "s" },
            {
              id: "remove",
              label: "Remove",
              icon: "trash",
              tone: "danger",
              hint: "Its images stay",
              onSelect: () => void removeComparison(task.id),
            },
          ]}
          trigger={<IconButton icon="more-horizontal" label="More" />}
        />
      </header>
      <div
        className={cn("min-h-0 flex-1", page === "setup" ? "overflow-y-auto" : "overflow-hidden")}
      >
        {page === "setup" ? (
          <TaskSetup task={task} />
        ) : task.results.length ? (
          <TaskResults task={task} />
        ) : (
          <EmptyState
            className="m-auto mt-16 max-w-sm"
            icon="layout-grid"
            title="Nothing made yet"
            text="Set what to compare, then start it. The images show up here as they're made."
            action={
              <Button icon="sliders" onClick={() => setPage("setup")}>
                Go to the setup
              </Button>
            }
          />
        )}
      </div>
    </>
  );
}
