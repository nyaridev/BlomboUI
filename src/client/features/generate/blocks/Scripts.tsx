/**
 * The Scripts block (layout feature "scripts"): turn Generate into a prompt matrix, an XY plot or
 * scope thumbnails. Off by default; when a script is on, the Generate button runs it instead
 * (features/generate/actions.ts) and the block shows how many images it makes or what's wrong.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useModels } from "@client/lib/queries";
import {
  Button,
  Checkbox,
  Collapsible,
  NumberField,
  Segmented,
  Select,
  Switch,
  TextArea,
  TextField,
} from "@client/ui";
import { MAX_MATRIX_TERMS, MAX_SCRIPT_RUNS } from "@shared/scripts";
import type { Binding } from "@shared/workflow/manifest";
import { useMemo, useState } from "react";
import {
  type AxisDraft,
  axisHint,
  axisOptions,
  buildScript,
  SCRIPT_LABELS,
  type ScriptChoice,
  type ScriptDraft,
  useScript,
} from "../scripts";
import { useValues } from "../state";
import { useBindings } from "../workflow";

/** The current script, planned against the current values (shared by the block and the button). */
export function useBuiltScript() {
  const draft = useScript((s) => s.draft);
  const bindings = useBindings();
  const values = useValues((s) => s.values);
  return useMemo(() => buildScript(draft, bindings, values), [draft, bindings, values]);
}

export function ScriptsBlock() {
  const draft = useScript((s) => s.draft);
  const set = useScript((s) => s.set);
  const bindings = useBindings();
  const built = useBuiltScript();
  const on = draft.kind !== "off";
  const count = built.plan?.cells.length ?? 0;

  return (
    <Collapsible
      title="Scripts"
      icon="layout-grid"
      subtitle={
        on
          ? built.error
            ? `${SCRIPT_LABELS[draft.kind as Exclude<ScriptChoice, "off">]} · needs a fix`
            : `${SCRIPT_LABELS[draft.kind as Exclude<ScriptChoice, "off">]} · ${count} image${count === 1 ? "" : "s"}`
          : "Prompt matrix, XY plot, scope thumbnails"
      }
      enabled={on}
      onEnabledChange={(v) => set({ kind: v ? (draft.kind === "off" ? "xy" : draft.kind) : "off" })}
    >
      <div className="flex flex-col gap-3">
        <Segmented<Exclude<ScriptChoice, "off">>
          full
          size="sm"
          label="Script"
          value={draft.kind === "off" ? "xy" : draft.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: "matrix", label: "Matrix" },
            { value: "xy", label: "XY plot" },
            { value: "thumbs", label: "Thumbnails" },
          ]}
        />
        {draft.kind === "matrix" ? <MatrixEditor draft={draft} bindings={bindings} /> : null}
        {draft.kind === "xy" || draft.kind === "off" ? (
          <XYEditor draft={draft} bindings={bindings} />
        ) : null}
        {draft.kind === "thumbs" ? <ThumbsEditor draft={draft} bindings={bindings} /> : null}
        {draft.kind !== "thumbs" ? (
          <div className="flex items-center gap-2">
            <Switch
              size="sm"
              checked={draft.grid}
              onCheckedChange={(grid) => set({ grid })}
              label="Put the results into one labeled grid"
            />
            <span className="text-xs text-fg-2">Put the results into one labeled grid</span>
          </div>
        ) : null}
        <p
          className={cn(
            "flex items-start gap-1.5 text-2xs",
            built.error ? "text-warning" : "text-fg-3",
          )}
        >
          <Icon name={built.error ? "info" : "layout-grid"} size={12} className="mt-px shrink-0" />
          {built.error
            ? built.error
            : on
              ? `Generate queues ${count} image${count === 1 ? "" : "s"} with one seed${draft.kind === "thumbs" ? `, saved as thumbnails in the "${draft.thumbs.scope || "default"}" scope` : draft.grid ? ", then a grid of them" : ""}.`
              : `Turn on to queue up to ${MAX_SCRIPT_RUNS} images from one click.`}
        </p>
      </div>
    </Collapsible>
  );
}

function MatrixEditor({ draft, bindings }: { draft: ScriptDraft; bindings: Binding[] }) {
  const set = useScript((s) => s.set);
  const prompts = bindings.filter((b) => b.type === "prompt");
  return (
    <div className="flex flex-col gap-2">
      {prompts.length > 1 ? (
        <Select
          size="sm"
          label="Prompt"
          value={draft.matrix.binding}
          onChange={(binding) => set({ matrix: { ...draft.matrix, binding } })}
          options={prompts.map((b) => ({ value: b.id, label: b.label }))}
        />
      ) : null}
      <TextArea
        mono
        aria-label="Terms"
        placeholder={"wearing a scarf\nat night\nwatercolor"}
        value={draft.matrix.terms}
        onChange={(e) => set({ matrix: { ...draft.matrix, terms: e.target.value } })}
        maxRows={MAX_MATRIX_TERMS + 1}
      />
      <span className="text-2xs text-fg-3">
        One term per line, up to {MAX_MATRIX_TERMS}. Every combination of them, on and off, is added
        to the end of the prompt: 3 terms make 8 images.
      </span>
    </div>
  );
}

function AxisEditor({
  name,
  axis,
  bindings,
  onChange,
}: {
  name: string;
  axis: AxisDraft;
  bindings: Binding[];
  onChange: (axis: AxisDraft) => void;
}) {
  const options = axisOptions(bindings);
  const b = bindings.find((x) => x.id === axis.source);
  const choices = b && (b.type === "enum" || b.type === "model") ? (b.options ?? []) : [];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="w-4 text-xs font-medium text-fg-2">{name}</span>
        <Select
          size="sm"
          className="min-w-0 flex-1"
          label={`${name} axis`}
          value={options.some((o) => o.value === axis.source) ? axis.source : null}
          placeholder="Pick a parameter"
          onChange={(source) => onChange({ source, text: "" })}
          options={options}
        />
      </div>
      <div className="flex items-center gap-2 pl-6">
        <TextField
          size="sm"
          mono
          className="flex-1"
          aria-label={`${name} values`}
          value={axis.text}
          placeholder={axis.source.startsWith("sr:") ? "fox, cat, owl" : "4, 6, 8"}
          onChange={(e) => onChange({ ...axis, text: e.target.value })}
        />
        {choices.length ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onChange({ ...axis, text: choices.slice(0, MAX_SCRIPT_RUNS).join(", ") })
            }
          >
            All {choices.length}
          </Button>
        ) : null}
      </div>
      <span className="pl-6 text-2xs text-fg-3">{axisHint(axis.source, bindings)}</span>
    </div>
  );
}

function XYEditor({ draft, bindings }: { draft: ScriptDraft; bindings: Binding[] }) {
  const set = useScript((s) => s.set);
  return (
    <div className="flex flex-col gap-3">
      <AxisEditor name="X" axis={draft.x} bindings={bindings} onChange={(x) => set({ x })} />
      {draft.y ? (
        <AxisEditor name="Y" axis={draft.y} bindings={bindings} onChange={(y) => set({ y })} />
      ) : null}
      <div>
        <Button
          size="sm"
          variant="ghost"
          icon={draft.y ? "minus" : "plus"}
          onClick={() => set({ y: draft.y ? null : { source: "sampler.steps", text: "20, 30" } })}
        >
          {draft.y ? "Remove the Y axis" : "Add a Y axis"}
        </Button>
      </div>
    </div>
  );
}

function ThumbsEditor({ draft, bindings }: { draft: ScriptDraft; bindings: Binding[] }) {
  const set = useScript((s) => s.set);
  const t = draft.thumbs;
  const [filter, setFilter] = useState("");
  const loras = useModels(t.target === "lora" ? "loras" : null);
  const model =
    bindings.find((b) => b.role === "model.checkpoint") ??
    bindings.find((b) => b.role === "model.unet");
  const all = (t.target === "lora" ? loras.data?.names : model?.options) ?? [];
  const q = filter.trim().toLowerCase();
  const shown = q ? all.filter((m) => m.toLowerCase().includes(q)) : all;
  const patch = (p: Partial<ScriptDraft["thumbs"]>) => set({ thumbs: { ...t, ...p } });
  const toggle = (m: string, on: boolean) =>
    patch({ models: on ? [...t.models, m] : t.models.filter((x) => x !== m) });

  return (
    <div className="flex flex-col gap-2.5">
      <Segmented<"model" | "lora">
        size="sm"
        label="Thumbnails for"
        value={t.target}
        onChange={(target) => patch({ target, models: [] })}
        options={[
          { value: "model", label: model?.label ?? "Checkpoints" },
          { value: "lora", label: "LoRAs" },
        ]}
      />
      <div className="flex items-center gap-2">
        <TextField
          size="sm"
          icon="search"
          className="flex-1"
          placeholder="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onClear={() => setFilter("")}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={!shown.length}
          onClick={() =>
            patch({ models: [...new Set([...t.models, ...shown])].slice(0, MAX_SCRIPT_RUNS) })
          }
        >
          All
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!t.models.length}
          onClick={() => patch({ models: [] })}
        >
          None
        </Button>
      </div>
      <div className="scroll-quiet flex max-h-48 flex-col gap-1 overflow-auto rounded-md border border-line bg-sunken p-2">
        {shown.length ? (
          shown.map((m) => (
            <Checkbox
              key={m}
              checked={t.models.includes(m)}
              onCheckedChange={(on) => toggle(m, on)}
              label={<span className="font-mono text-[11.5px]">{m}</span>}
            />
          ))
        ) : (
          <span className="px-1 py-2 text-xs text-fg-3">
            {all.length
              ? "Nothing matches the filter."
              : "No models to pick. Start ComfyUI, or add models to your folder."}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <TextField
          size="sm"
          mono
          className="w-40"
          aria-label="Scope"
          value={t.scope}
          onChange={(e) => patch({ scope: e.target.value })}
          icon="tag"
        />
        <span className="text-2xs text-fg-3">Scope · {t.models.length} picked</span>
        {t.target === "lora" ? (
          <NumberField
            size="sm"
            label="Weight"
            value={t.loraWeight}
            onChange={(loraWeight) => patch({ loraWeight })}
            min={-4}
            max={4}
            step={0.05}
            className="ml-auto w-24"
          />
        ) : null}
      </div>
    </div>
  );
}
