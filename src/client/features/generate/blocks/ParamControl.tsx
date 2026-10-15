/**
 * Renders one bound parameter in the control style chosen by its layout block. This is the
 * piece Customize mode changes: same binding, different control.
 */
import { cn } from "@client/lib/cn";
import { formatNumber } from "@client/lib/number";
import {
  Checkbox,
  Chip,
  Field,
  NumberField,
  ScrubField,
  Segmented,
  Select,
  Slider,
  Switch,
  TextArea,
  TextField,
} from "@client/ui";
import {
  CONTROL_STYLES,
  type ControlFamily,
  controlFamily,
  type ParamBlock,
} from "@shared/layout/schema";
import type { Binding } from "@shared/workflow/manifest";
import { modelDisplayName, samplerGroup, samplerLabel, schedulerLabel } from "../labels";
import { useValue } from "../state";

export function defaultStyle(family: ControlFamily | null): string {
  return family ? CONTROL_STYLES[family][0] : "text";
}

export function optionLabel(binding: Binding, value: string): string {
  if (binding.role === "sampler.name") return samplerLabel(value);
  if (binding.role === "sampler.scheduler") return schedulerLabel(value);
  if (binding.type === "model" || binding.type === "image") return modelDisplayName(value);
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

/** Model and image inputs with choices behave like enums (a dropdown of files). */
export function bindingFamily(binding: Binding) {
  return controlFamily(binding.type) ?? (binding.options ? "enum" : null);
}

function numberPresets(b: Binding): number[] {
  if (b.presets?.length) return b.presets.filter((p): p is number => typeof p === "number");
  const min = b.min ?? 0;
  const max = b.max ?? 1;
  const step = b.step ?? 1;
  return [0.1, 0.3, 0.5, 0.75].map((t) =>
    Number((Math.round((min + t * (max - min)) / step) * step).toFixed(4)),
  );
}

export function ParamControl({ binding, block }: { binding: Binding; block: ParamBlock }) {
  const [value, setValue] = useValue<unknown>(binding.id);
  const family = bindingFamily(binding);
  const style = block.control ?? defaultStyle(family);
  const size = block.size ?? "md";
  const label = block.label === "hidden" ? undefined : (block.title ?? binding.label);
  const min = binding.min ?? 0;
  const max = binding.max ?? 100;
  const step = binding.step ?? (binding.type === "int" ? 1 : 0.01);

  if (family === "number") {
    const n = typeof value === "number" ? value : min;
    const set = (v: number) => setValue(v);
    if (style === "scrub")
      return (
        <ScrubField
          label={label ?? binding.label}
          value={n}
          onChange={set}
          min={min}
          max={max}
          step={step}
          size={size}
        />
      );
    if (style === "number")
      return label ? (
        <Field label={label}>
          <NumberField
            value={n}
            onChange={set}
            min={min}
            max={max}
            step={step}
            size={size}
            label={label}
          />
        </Field>
      ) : (
        <NumberField
          value={n}
          onChange={set}
          min={min}
          max={max}
          step={step}
          size={size}
          label={binding.label}
        />
      );
    if (style === "chips") {
      const presets = numberPresets(binding);
      return (
        <div className="flex flex-col gap-1.5">
          {label ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-fg-2">{label}</span>
              <span className="font-mono text-xs text-fg tabular">{formatNumber(n, step)}</span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <Chip
                key={p}
                size={size === "lg" ? "md" : "sm"}
                selected={p === n}
                onClick={() => set(p)}
              >
                <span className="font-mono tabular">{formatNumber(p, step)}</span>
              </Chip>
            ))}
          </div>
        </div>
      );
    }
    return (
      <Slider
        label={label ?? ""}
        value={n}
        onChange={set}
        min={min}
        max={max}
        step={step}
        size={size}
      />
    );
  }

  if (family === "enum") {
    const options = binding.options ?? [];
    const v = typeof value === "string" ? value : (options[0] ?? "");
    const set = (x: string) => setValue(x);
    let control: React.ReactNode;
    if (style === "segmented") {
      control = (
        <Segmented
          full
          size={size === "lg" ? "md" : "sm"}
          value={v}
          onChange={set}
          label={binding.label}
          options={options.map((o) => ({ value: o, label: optionLabel(binding, o) }))}
          className="flex-wrap"
        />
      );
    } else if (style === "chips") {
      control = (
        <div className="flex flex-wrap gap-1">
          {options.map((o) => (
            <Chip key={o} size="sm" selected={o === v} onClick={() => set(o)}>
              {optionLabel(binding, o)}
            </Chip>
          ))}
        </div>
      );
    } else {
      control = (
        <Select
          value={v}
          onChange={set}
          size={size}
          label={binding.label}
          className="w-full"
          options={options.map((o) => ({
            value: o,
            label: optionLabel(binding, o),
            group: binding.role === "sampler.name" ? samplerGroup(o) : undefined,
          }))}
        />
      );
    }
    return label ? <Field label={label}>{control}</Field> : control;
  }

  if (family === "bool") {
    const b = value === true;
    if (style === "checkbox")
      return <Checkbox checked={b} onCheckedChange={setValue} label={label ?? binding.label} />;
    return (
      <div
        className={cn("flex items-center justify-between gap-3", size === "lg" ? "h-10" : "h-8")}
      >
        <span className="text-sm text-fg-2">{label ?? binding.label}</span>
        <Switch
          checked={b}
          onCheckedChange={setValue}
          label={binding.label}
          size={size === "sm" ? "sm" : "md"}
        />
      </div>
    );
  }

  const text =
    typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  const input =
    style === "textarea" || (!block.control && binding.multiline) ? (
      <TextArea value={text} onChange={(e) => setValue(e.target.value)} />
    ) : (
      <TextField value={text} onChange={(e) => setValue(e.target.value)} size={size} />
    );
  return label ? <Field label={label}>{input}</Field> : input;
}
