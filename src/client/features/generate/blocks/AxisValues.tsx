/**
 * The values of one axis, in the control its type takes: model and LoRA tiles (ModelPicks), a
 * multi-pick list for choices, sizes and switches, or a text box for numbers ("4, 6, 8",
 * "10-30 (+5)") and Prompt S/R ("fox, cat, owl"). Shared by the XY plot and Compare's rows.
 */
import { useSettings } from "@client/lib/queries";
import { MultiSelect, Select, TextField } from "@client/ui";
import type { ModelKind } from "@shared/constants";
import { type AxisDraft, axisInput, axisName, MAX_SCRIPT_RUNS } from "@shared/scripts";
import type { Binding } from "@shared/workflow/manifest";
import { useChoiceFilter } from "../hiddenChoices";
import { samplerLabel } from "../labels";
import { ModelPicks } from "./ModelPicks";

export function AxisValues({
  axis,
  bindings,
  label,
  onChange,
}: {
  axis: AxisDraft;
  bindings: Binding[];
  /** The control's name ("X values"). */
  label: string;
  onChange: (axis: AxisDraft) => void;
}) {
  const input = axisInput(axis.type, bindings);
  if (input === "none")
    return (
      <Select
        size="sm"
        value={null}
        placeholder="Pick a type first"
        disabled
        options={[]}
        onChange={() => {}}
      />
    );
  if (input === "models") {
    const kind: ModelKind =
      axis.type === "lora"
        ? "loras"
        : ((bindings.find((b) => b.id === axis.type)?.modelKind as ModelKind) ?? "checkpoints");
    return (
      <ModelPicks
        kind={kind}
        value={axis.picks}
        label={label}
        title={`${label} · ${axisName(axis.type, bindings)}`}
        onChange={(picks) => onChange({ ...axis, picks })}
      />
    );
  }
  if (input === "list") return <AxisList axis={axis} bindings={bindings} onChange={onChange} />;
  return (
    <TextField
      size="sm"
      mono
      aria-label={label}
      value={axis.text}
      placeholder={axis.type === "replace" ? "fox, cat, owl" : "4, 6, 8 · 10-30 (+5)"}
      onChange={(e) => onChange({ ...axis, text: e.target.value })}
    />
  );
}

function AxisList({
  axis,
  bindings,
  onChange,
}: {
  axis: AxisDraft;
  bindings: Binding[];
  onChange: (axis: AxisDraft) => void;
}) {
  const settings = useSettings().data;
  const b = bindings.find((x) => x.id === axis.type);
  const filter = useChoiceFilter(
    b?.role === "sampler.name" ? "sampler" : b?.role === "sampler.scheduler" ? "scheduler" : null,
  );
  const options =
    axis.type === "resolution"
      ? (settings?.generate.setResolutions ?? []).map((r) => ({
          value: r,
          label: r.replace("x", "×"),
        }))
      : b?.type === "bool"
        ? [
            { value: "1", label: "On" },
            { value: "0", label: "Off" },
          ]
        : filter(b?.options ?? [], "").map((o) => ({
            value: o,
            label: b?.role === "sampler.name" ? samplerLabel(o) : o,
          }));
  return (
    <MultiSelect
      size="sm"
      value={axis.picks}
      placeholder="Pick values"
      onChange={(picks) => onChange({ ...axis, picks: picks.slice(0, MAX_SCRIPT_RUNS) })}
      options={options}
    />
  );
}
