/**
 * A comparison's setup: what it starts from (Generate's settings when it was made, or taken again),
 * the seed, and the rows: each a setting (a model, LoRA, sampler, scheduler, CFG, steps, size,
 * a prompt word…) with the values to try. Under them, how many images that makes and Start.
 * Rows save on their own as you edit them; a running comparison can't change until it's stopped.
 */
import { Icon } from "@client/icons/Icon";
import { Button, Checkbox, Dialog, IconButton, Notice, NumberField, Select } from "@client/ui";
import type { CompareTask } from "@shared/compare";
import { MAX_COMPARE_AXES } from "@shared/compare";
import { MAX_SEED, randomSeed } from "@shared/random";
import { type AxisDraft, NO_AXIS } from "@shared/scripts";
import { type Binding, bindingFor } from "@shared/workflow/manifest";
import { useEffect, useMemo, useRef, useState } from "react";
import { AxisValues } from "../generate/blocks/AxisValues";
import { axisTypes } from "../generate/scripts";
import { generateBase, startComparison, stopComparison, updateComparison } from "./actions";
import { useTaskPlan } from "./state";

/** Settings that can be in two rows at once (different LoRAs, different words). */
const SHARED = new Set(["lora", "replace"]);

export function TaskSetup({ task }: { task: CompareTask }) {
  const [axes, setAxes] = useState(task.axes);
  const saved = useRef(task.axes);
  // Another comparison opened, or another window changed this one: show what's saved.
  useEffect(() => {
    if (JSON.stringify(task.axes) !== JSON.stringify(saved.current)) {
      saved.current = task.axes;
      setAxes(task.axes);
    }
  }, [task.axes]);
  // Edits save a moment after the last change.
  useEffect(() => {
    if (JSON.stringify(axes) === JSON.stringify(saved.current)) return;
    const t = setTimeout(() => {
      saved.current = axes;
      void updateComparison(task.id, { axes });
    }, 400);
    return () => clearTimeout(t);
  }, [axes, task.id]);

  const planned = useTaskPlan(task, axes);
  const { bindings, plan, error } = planned;
  const locked = task.running;
  const set = (i: number, axis: AxisDraft) => setAxes((a) => a.map((x, j) => (j === i ? axis : x)));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-5 max-lg:p-3">
      {locked ? (
        <Notice tone="info" title="It's running">
          Stop it to change what it compares.
        </Notice>
      ) : null}
      <BaseCard task={task} bindings={bindings} />

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="label-caps text-fg-3">Settings to compare</h3>
          <span className="text-xs text-fg-4">
            Every combination of the values below is made, with the same seed.
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {axes.map((axis, i) => (
            <AxisCard
              key={i}
              index={i}
              axis={axis}
              used={axes.filter((_, j) => j !== i).map((a) => a.type)}
              bindings={bindings}
              count={plan?.axes[i]?.values.length ?? null}
              disabled={locked}
              onChange={(a) => set(i, a)}
              onRemove={() => setAxes((a) => a.filter((_, j) => j !== i))}
            />
          ))}
          {axes.length < MAX_COMPARE_AXES ? (
            <button
              type="button"
              disabled={locked}
              onClick={() => setAxes((a) => [...a, NO_AXIS])}
              className="flex h-12 items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm text-fg-3 transition-colors hover:border-accent-ink/50 hover:text-fg focus-ring disabled:opacity-45"
            >
              <Icon name="plus" size={15} />
              {axes.length ? "Add another setting" : "Add a setting to compare"}
            </button>
          ) : null}
        </div>
      </section>

      <RunFooter
        task={task}
        count={plan?.cells.length ?? 0}
        keys={plan?.cells.map((c) => c.key)}
        error={axes.length ? error : null}
      />
    </div>
  );
}

/* ── what it starts from ─────────────────────────────────────────────── */

function short(value: unknown): string {
  const text = String(value ?? "").trim();
  return (
    text
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.replace(/\.[a-z0-9]+$/i, "") ?? text
  );
}

function BaseCard({ task, bindings }: { task: CompareTask; bindings: Binding[] }) {
  const [confirm, setConfirm] = useState(false);
  const v = task.values;
  const prompt = bindingFor(bindings, "prompt.positive");
  const model = bindings.find((b) => b.type === "model");
  const w = bindingFor(bindings, "latent.width");
  const h = bindingFor(bindings, "latent.height");
  const made = task.results.some((r) => r.image);
  const take = async () => {
    const base = generateBase();
    if (base) await updateComparison(task.id, { base });
    setConfirm(false);
  };
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="label-caps text-fg-3">Starts from</h3>
          <p className="mt-1 text-sm text-fg">
            {task.workflowName}
            {model ? <span className="text-fg-3"> · {short(v[model.id])}</span> : null}
            {w && h ? (
              <span className="font-mono text-fg-3">
                {" "}
                · {String(v[w.id])}×{String(v[h.id])}
              </span>
            ) : null}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon="generate"
          disabled={task.running}
          onClick={() => (made ? setConfirm(true) : void take())}
        >
          Take Generate's settings
        </Button>
      </div>
      {prompt && v[prompt.id] ? (
        <p className="line-clamp-2 font-mono text-xs text-fg-2">{String(v[prompt.id])}</p>
      ) : null}
      <SeedRow task={task} />
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Take Generate's settings?"
        description="Its images were made with the old settings, so they're cleared from this comparison (they stay in the gallery)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep the old ones
            </Button>
            <Button variant="primary" onClick={() => void take()}>
              Take them
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </section>
  );
}

function SeedRow({ task }: { task: CompareTask }) {
  const made = task.results.some((r) => r.image);
  const fixed = made || task.running;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-fg-3">Seed</span>
        {fixed ? (
          <span className="font-mono text-sm text-fg tabular">{task.seed ?? "random"}</span>
        ) : (
          <>
            <NumberField
              size="sm"
              label="Seed"
              value={task.seed ?? 0}
              min={0}
              max={MAX_SEED}
              onChange={(seed) => void updateComparison(task.id, { seed })}
              className="w-36"
            />
            <IconButton
              icon="dice"
              label="A random seed"
              size="sm"
              onClick={() => void updateComparison(task.id, { seed: randomSeed() })}
            />
          </>
        )}
      </div>
      <Checkbox
        checked={task.randomSeeds}
        disabled={task.running}
        onCheckedChange={(randomSeeds) => void updateComparison(task.id, { randomSeeds })}
        label="A new random seed for each image"
      />
      {fixed ? <span className="text-xs text-fg-4">Clone it to try another seed.</span> : null}
    </div>
  );
}

/* ── one row ─────────────────────────────────────────────────────────── */

function AxisCard({
  index,
  axis,
  used,
  bindings,
  count,
  disabled,
  onChange,
  onRemove,
}: {
  index: number;
  axis: AxisDraft;
  /** The other rows' settings. */
  used: string[];
  bindings: Binding[];
  count: number | null;
  disabled: boolean;
  onChange: (axis: AxisDraft) => void;
  onRemove: () => void;
}) {
  const types = useMemo(
    () =>
      axisTypes(bindings, "").filter(
        (t) => t.value === axis.type || SHARED.has(t.value) || !used.includes(t.value),
      ),
    [bindings, used, axis.type],
  );
  return (
    <div
      className="grid grid-cols-[1.75rem_minmax(0,12rem)_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border border-line bg-surface p-3 max-lg:grid-cols-[1.75rem_minmax(0,1fr)_auto]"
      aria-disabled={disabled || undefined}
    >
      <span className="mt-1 flex size-6 items-center justify-center rounded-md bg-field text-xs text-fg-3 tabular">
        {index + 1}
      </span>
      <fieldset disabled={disabled} className="contents">
        <Select
          size="sm"
          label={`Setting ${index + 1}`}
          value={types.some((t) => t.value === axis.type) ? axis.type : "none"}
          onChange={(type) => onChange({ ...NO_AXIS, type })}
          options={types.map((t) => (t.value === "none" ? { ...t, label: "Pick a setting" } : t))}
        />
        <div className="flex min-w-0 flex-col gap-1 max-lg:col-span-2 max-lg:col-start-2 max-lg:row-start-2">
          <AxisValues
            axis={axis}
            bindings={bindings}
            label={`Values for setting ${index + 1}`}
            onChange={onChange}
          />
        </div>
      </fieldset>
      <div className="flex items-center gap-1 max-lg:col-start-3 max-lg:row-start-1">
        {count ? (
          <span className="text-xs whitespace-nowrap text-fg-3 tabular">
            {count} value{count === 1 ? "" : "s"}
          </span>
        ) : null}
        <IconButton
          icon="x"
          label="Remove this setting"
          size="sm"
          disabled={disabled}
          onClick={onRemove}
        />
      </div>
    </div>
  );
}

/* ── start ───────────────────────────────────────────────────────────── */

function RunFooter({
  task,
  count,
  keys,
  error,
}: {
  task: CompareTask;
  count: number;
  keys: string[] | undefined;
  error: string | null;
}) {
  const done = new Set(task.results.filter((r) => r.state === "done").map((r) => r.key));
  const missing = keys?.filter((k) => !done.has(k)).length ?? 0;
  const some = keys?.some((k) => done.has(k)) ?? false;
  return (
    <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 shadow-pop">
      <p className="flex min-w-0 items-center gap-1.5 text-sm">
        {error ? (
          <>
            <Icon name="info" size={14} className="shrink-0 text-warning" />
            <span className="text-warning">{error}</span>
          </>
        ) : count ? (
          <>
            <span className="font-medium text-fg tabular">
              {count} image{count === 1 ? "" : "s"}
            </span>
            {some ? (
              <span className="text-fg-3 tabular">
                {missing ? `· ${missing} not made yet` : "· all made"}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-fg-3">Add a setting and the values to try.</span>
        )}
      </p>
      <div className="flex items-center gap-2">
        {task.running ? (
          <Button variant="danger" icon="stop" onClick={() => void stopComparison(task.id)}>
            Stop
          </Button>
        ) : (
          <>
            {some ? (
              <Button
                variant="ghost"
                icon="refresh"
                disabled={!count || Boolean(error)}
                onClick={() => void startComparison(task.id, "all")}
              >
                Run all again
              </Button>
            ) : null}
            <Button
              variant="primary"
              icon="play"
              disabled={!missing || Boolean(error)}
              onClick={() => void startComparison(task.id, "missing")}
            >
              {!some
                ? `Start · ${count} image${count === 1 ? "" : "s"}`
                : missing
                  ? `Make the ${missing} missing`
                  : "All made"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
