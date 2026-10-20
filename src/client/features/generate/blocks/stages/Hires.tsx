/**
 * Hires fix: upscale the finished image (with an upscale model, or a plain resize), then sample
 * it again at a low denoise. Steps, CFG, sampler, scheduler and prompts follow the base until
 * unlinked; the size follows the base size by a factor, or a fixed target.
 */
import { Checkbox, Collapsible, Field, NumberField, Segmented, Select, Slider } from "@client/ui";
import { hiresSize } from "@shared/workflow/stages";
import { useStage, useValues } from "../../state";
import { useRoleBinding } from "../../workflow";
import {
  InheritChoice,
  InheritNumber,
  InheritPrompt,
  modelOptions,
  problemSummary,
  StageNotices,
  useStageStatus,
} from "./common";

function useBaseSize(): { width: number; height: number } | null {
  const w = useRoleBinding("latent.width")?.id;
  const h = useRoleBinding("latent.height")?.id;
  const width = useValues((s) => (w ? Number(s.values[w]) : Number.NaN));
  const height = useValues((s) => (h ? Number(s.values[h]) : Number.NaN));
  return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
}

export function HiresStage() {
  const [h, set] = useStage("hires");
  const status = useStageStatus("hires");
  const base = useBaseSize();
  const size = hiresSize(h, base);
  const upscaler = h.upscaler ? h.upscaler.replace(/\.(pth|pt|safetensors)$/i, "") : "resize";
  const diffusion = status?.family === "diffusion";
  const fallback = status?.problems.length ? problemSummary(status) : null;
  return (
    <Collapsible
      title="Hires fix"
      icon="upscale"
      subtitle={
        fallback ??
        `${h.sizeMode === "scale" ? `${h.scale}× ` : ""}→ ${size ? `${size.width}×${size.height}` : "?"} · ${upscaler} · denoise ${h.denoise}`
      }
      enabled={h.enabled}
      onEnabledChange={(enabled) => set({ enabled })}
    >
      <div className="flex flex-col gap-3.5">
        <StageNotices status={status} />
        <Segmented
          full
          size="sm"
          value={h.sizeMode}
          onChange={(sizeMode) => set({ sizeMode })}
          options={[
            { value: "scale", label: "Scale by" },
            { value: "target", label: "Target size" },
          ]}
        />
        {h.sizeMode === "scale" ? (
          <Slider
            label="Scale"
            value={h.scale}
            onChange={(scale) => set({ scale })}
            min={1}
            max={4}
            step={0.05}
            unit="×"
            marks={[1.5, 2]}
            defaultValue={1.5}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Width">
              <NumberField
                value={h.width}
                onChange={(width) => set({ width })}
                min={64}
                max={8192}
                step={8}
                label="Hires width"
                unit="px"
              />
            </Field>
            <Field label="Height">
              <NumberField
                value={h.height}
                onChange={(height) => set({ height })}
                min={64}
                max={8192}
                step={8}
                label="Hires height"
                unit="px"
              />
            </Field>
          </div>
        )}
        <Field
          label="Upscaler"
          hint={
            h.upscaler
              ? undefined
              : "Without a model the image is resized (Lanczos) before the second pass."
          }
        >
          <Select
            value={h.upscaler}
            onChange={(upscaler) => set({ upscaler })}
            options={modelOptions(status?.choices.upscaler, h.upscaler, "None (resize only)")}
            className="w-full"
            label="Upscaler"
          />
        </Field>
        <Slider
          label="Denoise"
          value={h.denoise}
          onChange={(denoise) => set({ denoise })}
          min={0}
          max={1}
          step={0.01}
          marks={[0.35, 0.5]}
          defaultValue={0.35}
        />
        <div className="grid grid-cols-2 gap-3">
          <InheritNumber
            field="steps"
            label="Steps"
            settings={h}
            onChange={set}
            min={1}
            max={150}
            step={1}
          />
          {diffusion ? null : (
            <InheritNumber
              field="cfg"
              label="CFG"
              settings={h}
              onChange={set}
              min={0}
              max={30}
              step={0.5}
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InheritChoice
            field="sampler"
            label="Sampler"
            settings={h}
            onChange={set}
            choices={status?.choices.sampler}
          />
          <InheritChoice
            field="scheduler"
            label="Scheduler"
            settings={h}
            onChange={set}
            choices={status?.choices.scheduler}
          />
        </div>
        <InheritPrompt
          field="prompt"
          label="Prompt"
          settings={h}
          onChange={set}
          placeholder="A prompt for the Hires pass only"
        />
        {diffusion ? null : (
          <InheritPrompt
            field="negative"
            label="Negative"
            settings={h}
            onChange={set}
            placeholder="A negative prompt for the Hires pass only"
          />
        )}
        <Checkbox
          checked={h.saveFirst}
          onCheckedChange={(saveFirst) => set({ saveFirst })}
          label="Also save the image before Hires fix"
        />
      </div>
    </Collapsible>
  );
}
