/**
 * ADetailer: units that each find something (a face, hands, a person) with a detector, and
 * optionally SAM for a tighter mask, then redraw it at a higher resolution. Units run in order
 * after Hires fix. Sampling and prompts follow the base until unlinked, per unit.
 */
import { Collapsible, Field, Select, type SelectOption, Slider } from "@client/ui";
import { AdetailerUnit } from "@shared/workflow/stages";
import { useStage } from "../../state";
import {
  InheritChoice,
  InheritNumber,
  InheritPrompt,
  modelOptions,
  problemSummary,
  StageNotices,
  useStageStatus,
} from "./common";
import { UnitBar, UnitHeader, useUnits } from "./units";

/** Detector files grouped by what they return: boxes or segments. */
function detectorOptions(names: string[] | undefined, current: string): SelectOption<string>[] {
  return modelOptions(names, current).map((o) => ({
    ...o,
    label: o.label.replace(/^(bbox|segm)\//, ""),
    group: o.group ?? (o.value.startsWith("segm/") ? "Segments" : "Boxes"),
  }));
}

export function AdetailerStage() {
  const [ad, set] = useStage("adetailer");
  const status = useStageStatus("adetailer");
  const units = useUnits(
    ad.units,
    (next) => set({ units: next }),
    (id, name, from) => AdetailerUnit.parse({ ...(from ?? {}), id, name, enabled: true }),
  );
  const unit = units.active;
  if (!unit) return null;
  const diffusion = status?.family === "diffusion";
  const on = ad.units.filter((u) => u.enabled);
  const issue = problemSummary(status);
  return (
    <Collapsible
      title="ADetailer"
      icon="face-scan"
      subtitle={
        issue ??
        (on.length
          ? `${on.length} unit${on.length === 1 ? "" : "s"} · ${on.map((u) => u.name).join(", ")}`
          : "No units on")
      }
      enabled={ad.enabled}
      onEnabledChange={(enabled) => set({ enabled })}
    >
      <div className="flex flex-col gap-3.5">
        <UnitBar
          units={ad.units}
          active={unit}
          onActive={units.setActive}
          onAdd={units.add}
          status={status}
          group="adetailer"
        />
        <UnitHeader
          unit={unit}
          count={ad.units.length}
          onChange={units.update}
          onRemove={units.remove}
        />
        <StageNotices status={status} unit={unit.id} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Detector">
            <Select
              value={unit.detector}
              onChange={(detector) => units.update({ detector })}
              options={detectorOptions(status?.choices.detector, unit.detector)}
              placeholder="Pick a detector"
              className="w-full"
              label="Detector"
            />
          </Field>
          <Field label="SAM">
            <Select
              value={unit.sam}
              onChange={(sam) => units.update({ sam })}
              options={modelOptions(status?.choices.sam, unit.sam, "None")}
              className="w-full"
              label="SAM model"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Slider
            label="Confidence"
            value={unit.confidence}
            onChange={(confidence) => units.update({ confidence })}
            min={0.05}
            max={1}
            step={0.05}
            defaultValue={0.5}
          />
          <Slider
            label="Denoise"
            value={unit.denoise}
            onChange={(denoise) => units.update({ denoise })}
            min={0.05}
            max={1}
            step={0.01}
            defaultValue={0.4}
          />
          <Slider
            label="Grow mask"
            value={unit.dilation}
            onChange={(dilation) => units.update({ dilation })}
            min={-64}
            max={128}
            step={1}
            unit="px"
            defaultValue={10}
          />
          <Slider
            label="Mask blur"
            value={unit.feather}
            onChange={(feather) => units.update({ feather })}
            min={0}
            max={64}
            step={1}
            unit="px"
            defaultValue={5}
          />
          <Slider
            label="Crop around"
            value={unit.cropFactor}
            onChange={(cropFactor) => units.update({ cropFactor })}
            min={1}
            max={6}
            step={0.1}
            unit="×"
            defaultValue={3}
          />
          <Slider
            label="Work size"
            value={unit.guideSize}
            onChange={(guideSize) => units.update({ guideSize })}
            min={256}
            max={2048}
            step={64}
            unit="px"
            defaultValue={512}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InheritNumber
            field="steps"
            label="Steps"
            settings={unit}
            onChange={units.update}
            min={1}
            max={150}
            step={1}
          />
          <InheritNumber
            field="cfg"
            label="CFG"
            settings={unit}
            onChange={units.update}
            min={0}
            max={30}
            step={0.5}
            fallback={diffusion ? 1 : undefined}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InheritChoice
            field="sampler"
            label="Sampler"
            settings={unit}
            onChange={units.update}
            choices={status?.choices.sampler}
          />
          <InheritChoice
            field="scheduler"
            label="Scheduler"
            settings={unit}
            onChange={units.update}
            choices={status?.choices.scheduler}
          />
        </div>
        <InheritPrompt
          field="prompt"
          label="Prompt"
          settings={unit}
          onChange={units.update}
          placeholder={`What ${unit.name.toLowerCase()} should look like`}
        />
        {diffusion ? null : (
          <InheritPrompt
            field="negative"
            label="Negative"
            settings={unit}
            onChange={units.update}
            placeholder="What to avoid in this unit"
          />
        )}
      </div>
    </Collapsible>
  );
}
