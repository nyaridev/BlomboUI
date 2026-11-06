/**
 * The Scripts block (layout feature "scripts"): turn Generate into a prompt matrix or an XY plot,
 * picked from a dropdown. Off by default; when a script is on, the Generate button runs it instead
 * (features/generate/actions.ts) and the block's header shows how many images it makes, or that
 * it needs a fix (said under the editor).
 *
 *   matrix  lines (typed or loaded from a .txt file) added at the start or end of a prompt, or
 *           replacing a text in the prompts; each line runs once, or the batch count and size
 *   xy      an X and a Y type (None, the workflow's models, LoRA, resolution, its parameters,
 *           Prompt S/R) with their values, plus how the grid is drawn
 *   compare no script on Generate: a button that opens the Compare view (every combination of
 *           any number of settings, as saved comparisons) and what's running there
 */
import { Icon } from "@client/icons/Icon";
import { useLocalModels } from "@client/lib/queries";
import {
  Button,
  Checkbox,
  Collapsible,
  Field,
  IconButton,
  Select,
  Slider,
  TextArea,
  TextField,
} from "@client/ui";
import {
  type AxisDraft,
  loraWeights,
  MAX_GRID_MARGIN,
  type MatrixInsert,
  NO_AXIS,
} from "@shared/scripts";
import type { Binding } from "@shared/workflow/manifest";
import { useMemo, useRef } from "react";
import { CompareScriptPanel } from "../../compare/ScriptPanel";
import {
  axisTypes,
  buildScript,
  SCRIPT_LABELS,
  type ScriptChoice,
  type ScriptDraft,
  useScript,
} from "../scripts";
import { useValues } from "../state";
import { useBindings } from "../workflow";
import { AxisValues } from "./AxisValues";

/** The current script, planned against the current values (shared by the block and the button). */
export function useBuiltScript() {
  const draft = useScript((s) => s.draft);
  const bindings = useBindings();
  // With no script, the values don't matter: don't re-render (and re-plan) on every keystroke.
  const values = useValues((s) => (draft.on ? s.values : NO_VALUES));
  const count = useValues((s) => s.run.count);
  const local = useLocalModels().data;
  const loraWeight = useMemo(() => loraWeights(local), [local]);
  return useMemo(
    () => buildScript(draft, bindings, values, { count, loraWeight }),
    [draft, bindings, values, count, loraWeight],
  );
}
const NO_VALUES: Record<string, unknown> = {};

export function ScriptsBlock() {
  const draft = useScript((s) => s.draft);
  const set = useScript((s) => s.set);
  const bindings = useBindings();
  const built = useBuiltScript();
  const count = built.plan?.cells.length ?? 0;

  return (
    <Collapsible
      tone="base"
      title="Scripts"
      icon="layout-grid"
      subtitle={
        !draft.on
          ? undefined
          : draft.kind === "compare"
            ? "Compare · its own view"
            : `${SCRIPT_LABELS[draft.kind]} · ${built.error ? "needs a fix" : `${count} image${count === 1 ? "" : "s"}`}`
      }
      enabled={draft.on}
      onEnabledChange={(on) => set({ on })}
    >
      <div className="flex flex-col gap-3">
        <Select<ScriptChoice>
          size="sm"
          label="Script"
          value={draft.kind}
          onChange={(kind) => set({ kind, on: true })}
          options={[
            { value: "matrix", label: SCRIPT_LABELS.matrix },
            { value: "xy", label: SCRIPT_LABELS.xy },
            { value: "compare", label: SCRIPT_LABELS.compare },
          ]}
        />
        {draft.kind === "matrix" ? (
          <MatrixEditor draft={draft.matrix} bindings={bindings} />
        ) : draft.kind === "xy" ? (
          <XYEditor draft={draft.xy} bindings={bindings} />
        ) : (
          <CompareScriptPanel />
        )}
        {draft.on && built.error ? (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <Icon name="info" size={13} className="mt-px shrink-0" />
            {built.error}
          </p>
        ) : null}
      </div>
    </Collapsible>
  );
}

/* ── Prompt matrix ─────────────────────────────────────────────────────── */

const INSERTS: Array<{ value: MatrixInsert; label: string }> = [
  { value: "start", label: "Start" },
  { value: "end", label: "End" },
  { value: "replace", label: "Prompt S/R" },
];

/** A label above a control, in a two-column row (type | values). */
const ROW = "grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-start gap-2";

function MatrixEditor({ draft, bindings }: { draft: ScriptDraft["matrix"]; bindings: Binding[] }) {
  const setMatrix = useScript((s) => s.setMatrix);
  const prompts = bindings.filter((b) => b.type === "prompt");
  const file = useRef<HTMLInputElement>(null);
  const load = async (f: File | undefined) => {
    if (!f) return;
    const lines = (await f.text())
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    setMatrix({ lines: lines.join("\n") });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className={ROW}>
        <Field label="Insert">
          <Select<MatrixInsert>
            size="sm"
            value={draft.insert}
            onChange={(insert) => setMatrix({ insert })}
            options={INSERTS}
          />
        </Field>
        {draft.insert === "replace" ? (
          <Field label="Text to replace">
            {(id) => (
              <TextField
                id={id}
                size="sm"
                mono
                placeholder="red hair"
                value={draft.search}
                onChange={(e) => setMatrix({ search: e.target.value })}
              />
            )}
          </Field>
        ) : (
          <Field label="Apply to">
            <Select
              size="sm"
              value={prompts.some((b) => b.id === draft.binding) ? draft.binding : null}
              placeholder="Pick a prompt"
              onChange={(binding) => setMatrix({ binding })}
              options={prompts.map((b) => ({ value: b.id, label: b.label }))}
            />
          </Field>
        )}
      </div>
      <Field
        label="Lines"
        action={
          <>
            <Button size="sm" variant="ghost" icon="upload" onClick={() => file.current?.click()}>
              Load from file
            </Button>
            <input
              ref={file}
              type="file"
              accept=".txt,text/plain"
              hidden
              onChange={(e) => {
                void load(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </>
        }
      >
        {(id) => (
          <TextArea
            id={id}
            mono
            placeholder={"black hair\nblonde hair\nsilver hair"}
            value={draft.lines}
            onChange={(e) => setMatrix({ lines: e.target.value })}
            maxRows={12}
          />
        )}
      </Field>
      <div className="flex flex-col gap-2">
        <Checkbox
          checked={draft.grid}
          onCheckedChange={(grid) => setMatrix({ grid })}
          label="Save a grid of the results"
        />
        <Checkbox
          checked={draft.useBatch}
          onCheckedChange={(useBatch) => setMatrix({ useBatch })}
          label="Use batch count and size for each line"
        />
      </div>
    </div>
  );
}

/* ── XY plot ───────────────────────────────────────────────────────────── */

function XYEditor({ draft, bindings }: { draft: ScriptDraft["xy"]; bindings: Binding[] }) {
  const setXY = useScript((s) => s.setXY);
  const lora = draft.x.type === "lora" || draft.y.type === "lora";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <AxisRow
            name="X"
            axis={draft.x}
            other={draft.y.type}
            bindings={bindings}
            onChange={(x) => setXY({ x })}
          />
          <AxisRow
            name="Y"
            axis={draft.y}
            other={draft.x.type}
            bindings={bindings}
            onChange={(y) => setXY({ y })}
          />
        </div>
        <IconButton
          icon="swap-vertical"
          label="Swap X and Y"
          variant="secondary"
          onClick={() => setXY({ x: draft.y, y: draft.x })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Checkbox
          checked={draft.legend}
          onCheckedChange={(legend) => setXY({ legend })}
          label="Label the grid"
        />
        <Checkbox
          checked={draft.legendType}
          disabled={!draft.legend}
          onCheckedChange={(legendType) => setXY({ legendType })}
          label="Name the type in labels (Steps: 20)"
        />
        <Checkbox
          checked={draft.randomSeeds}
          onCheckedChange={(randomSeeds) => setXY({ randomSeeds })}
          label="A new random seed for each image"
        />
        <Checkbox
          checked={draft.keepImages}
          onCheckedChange={(keepImages) => setXY({ keepImages })}
          label="Keep each image, not only the grid"
        />
        {lora ? (
          <Checkbox
            checked={draft.loraStrength}
            onCheckedChange={(loraStrength) => setXY({ loraStrength })}
            label="LoRAs at their saved strength (otherwise 1)"
          />
        ) : null}
      </div>
      <Slider
        label="Grid margins"
        unit="px"
        field
        size="sm"
        min={0}
        max={MAX_GRID_MARGIN}
        value={draft.margin}
        defaultValue={0}
        onChange={(margin) => setXY({ margin })}
      />
    </div>
  );
}

function AxisRow({
  name,
  axis,
  other,
  bindings,
  onChange,
}: {
  name: string;
  axis: AxisDraft;
  other: string;
  bindings: Binding[];
  onChange: (axis: AxisDraft) => void;
}) {
  const types = axisTypes(bindings, other);
  return (
    <div className={ROW}>
      <Field label={`${name} type`}>
        <Select
          size="sm"
          value={types.some((t) => t.value === axis.type) ? axis.type : "none"}
          onChange={(type) => onChange({ ...NO_AXIS, type })}
          options={types}
        />
      </Field>
      <Field label={`${name} values`}>
        <AxisValues axis={axis} bindings={bindings} label={`${name} values`} onChange={onChange} />
      </Field>
    </div>
  );
}
