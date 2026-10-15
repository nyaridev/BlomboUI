/**
 * Stage blocks (ADR-0004). Each one is a Collapsible with an enable switch and a one-line
 * summary, so you can read the setup without opening it. Stage fields inherit base values
 * (dimmed, with a link) until you unlink them.
 *
 * Not on the Generate screen yet: stages are graph patches that arrive in a later phase (see the
 * roadmap), and the column shows a placeholder until then. Model lists here come from ComfyUI.
 */
import { cn } from "@client/lib/cn";
import { useModels } from "@client/lib/queries";
import {
  Art,
  Button,
  Checkbox,
  Collapsible,
  Field,
  IconButton,
  InheritRow,
  NumberField,
  Segmented,
  Select,
  Slider,
  TextArea,
} from "@client/ui";
import { useState } from "react";
import { modelDisplayName, samplerLabel } from "../labels";
import { type AdUnit, type CnUnit, useStages, useValues } from "../state";

function useModelOptions(kind: "upscale_models" | "controlnet") {
  const names = useModels(kind).data?.names ?? [];
  return names.map((v) => ({ value: v, label: modelDisplayName(v) }));
}

export function HiresStage() {
  const upscalers = useModelOptions("upscale_models");
  const h = useStages((s) => s.hires);
  const patch = useStages((s) => s.patch);
  const base = useValues((s) => s.values);
  const w = Number(base["latent.width"]);
  const ht = Number(base["latent.height"]);
  const set = (v: Partial<typeof h>) => patch("hires", v);
  return (
    <Collapsible
      title="Hires fix"
      icon="upscale"
      subtitle={`${h.scale}× → ${Math.round((w * h.scale) / 8) * 8}×${Math.round((ht * h.scale) / 8) * 8} · ${h.upscaler} · denoise ${h.denoise}`}
      enabled={h.enabled}
      onEnabledChange={(enabled) => set({ enabled })}
      defaultOpen
    >
      <div className="flex flex-col gap-3.5">
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
        <Field label="Upscaler">
          <Select
            value={h.upscaler}
            onChange={(upscaler) => set({ upscaler })}
            options={upscalers}
            className="w-full"
          />
        </Field>
        <Slider
          label="Denoise"
          value={h.denoise}
          onChange={(denoise) => set({ denoise })}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.35}
        />
        <div className="grid grid-cols-2 gap-3">
          <InheritRow
            label="Steps"
            inherited={String(base["sampler.steps"])}
            overridden={h.stepsOverride}
            onOverride={(stepsOverride) => set({ stepsOverride })}
          >
            <NumberField
              value={h.steps}
              onChange={(steps) => set({ steps })}
              min={1}
              max={100}
              label="Hires steps"
            />
          </InheritRow>
          <InheritRow
            label="CFG"
            inherited={String(base["sampler.cfg"])}
            overridden={h.cfgOverride}
            onOverride={(cfgOverride) => set({ cfgOverride })}
          >
            <NumberField
              value={h.cfg}
              onChange={(cfg) => set({ cfg })}
              min={1}
              max={15}
              step={0.5}
              label="Hires CFG"
            />
          </InheritRow>
        </div>
        <InheritRow
          label="Sampler"
          inherited={samplerLabel(String(base["sampler.name"]))}
          overridden={h.samplerOverride}
          onOverride={(samplerOverride) => set({ samplerOverride })}
        >
          <Select
            value={h.sampler}
            onChange={(sampler) => set({ sampler })}
            options={[h.sampler].map((value) => ({ value, label: samplerLabel(value) }))}
            className="w-full"
          />
        </InheritRow>
        <Checkbox
          checked={h.saveFirst}
          onCheckedChange={(saveFirst) => set({ saveFirst })}
          label="Also save the first pass"
        />
      </div>
    </Collapsible>
  );
}

function UnitTabs<T extends { id: string; name: string }>({
  units,
  active,
  onActive,
  onAdd,
}: {
  units: T[];
  active: string;
  onActive: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {units.map((u, i) => (
        <button
          key={u.id}
          type="button"
          onClick={() => onActive(u.id)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors focus-ring",
            u.id === active
              ? "bg-field text-fg ring-1 ring-line-strong"
              : "text-fg-3 hover:bg-field hover:text-fg-2",
          )}
        >
          <span className="font-mono text-[10px] text-fg-4">{i + 1}</span>
          {u.name}
        </button>
      ))}
      <IconButton icon="plus" label="Add unit" size="sm" onClick={onAdd} />
    </div>
  );
}

const DETECTORS = ["face_yolov8m", "face_yolov8n", "hand_yolov8s", "person_yolov8m-seg"].map(
  (v) => ({ value: v, label: v }),
);

export function AdetailerStage() {
  const ad = useStages((s) => s.adetailer);
  const patch = useStages((s) => s.patch);
  const unit = ad.units.find((u) => u.id === ad.active) ?? (ad.units[0] as AdUnit);
  const setUnit = (v: Partial<AdUnit>) =>
    patch("adetailer", { units: ad.units.map((u) => (u.id === unit.id ? { ...u, ...v } : u)) });
  return (
    <Collapsible
      title="ADetailer"
      icon="face-scan"
      subtitle={`${ad.units.length} units · ${ad.units.map((u) => u.name).join(", ")}`}
      enabled={ad.enabled}
      onEnabledChange={(enabled) => patch("adetailer", { enabled })}
    >
      <div className="flex flex-col gap-3.5">
        <UnitTabs
          units={ad.units}
          active={unit.id}
          onActive={(active) => patch("adetailer", { active })}
          onAdd={() => {
            const id = `u${Date.now().toString(36)}`;
            patch("adetailer", {
              units: [...ad.units, { ...unit, id, name: `Unit ${ad.units.length + 1}` }],
              active: id,
            });
          }}
        />
        <Field label="Detector">
          <Select
            value={unit.detector}
            onChange={(detector) => setUnit({ detector })}
            options={DETECTORS}
            className="w-full"
          />
        </Field>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Slider
            label="Confidence"
            value={unit.confidence}
            onChange={(confidence) => setUnit({ confidence })}
            min={0.05}
            max={1}
            step={0.05}
          />
          <Slider
            label="Denoise"
            value={unit.denoise}
            onChange={(denoise) => setUnit({ denoise })}
            min={0}
            max={1}
            step={0.01}
          />
          <Slider
            label="Mask blur"
            value={unit.maskBlur}
            onChange={(maskBlur) => setUnit({ maskBlur })}
            min={0}
            max={64}
            step={1}
            unit="px"
          />
        </div>
        <InheritRow
          label="Prompt"
          inherited="Uses the main prompt"
          overridden={unit.promptOverride}
          onOverride={(promptOverride) => setUnit({ promptOverride })}
        >
          <TextArea
            value={unit.prompt}
            onChange={(e) => setUnit({ prompt: e.target.value })}
            placeholder="Prompt for this unit only"
          />
        </InheritRow>
      </div>
    </Collapsible>
  );
}

const PREPROCESSORS = [
  { value: "dwpose", label: "DWPose", group: "Pose" },
  { value: "openpose_full", label: "OpenPose (full)", group: "Pose" },
  { value: "canny", label: "Canny edges", group: "Lines" },
  { value: "lineart_anime", label: "Line art (anime)", group: "Lines" },
  { value: "depth_anything_v2", label: "Depth Anything v2", group: "Depth" },
  { value: "none", label: "None (image is already a map)", group: "Other" },
];

export function ControlNetStage() {
  const cn_ = useStages((s) => s.controlnet);
  const patch = useStages((s) => s.patch);
  const [showMap, setShowMap] = useState(true);
  const unit = cn_.units.find((u) => u.id === cn_.active) ?? (cn_.units[0] as CnUnit);
  const setUnit = (v: Partial<CnUnit>) =>
    patch("controlnet", { units: cn_.units.map((u) => (u.id === unit.id ? { ...u, ...v } : u)) });
  const models = useModelOptions("controlnet");
  return (
    <Collapsible
      title="ControlNet"
      icon="pose"
      subtitle={`${unit.name} · ${unit.preprocessor} · strength ${unit.strength}`}
      enabled={cn_.enabled}
      onEnabledChange={(enabled) => patch("controlnet", { enabled })}
    >
      <div className="flex flex-col gap-3.5">
        <UnitTabs
          units={cn_.units}
          active={unit.id}
          onActive={(active) => patch("controlnet", { active })}
          onAdd={() => {
            const id = `c${Date.now().toString(36)}`;
            patch("controlnet", {
              units: [...cn_.units, { ...unit, id, name: `Unit ${cn_.units.length + 1}` }],
              active: id,
            });
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="relative overflow-hidden rounded-md border border-line">
            <Art seed="cn-source" ratio={3 / 4} />
            <span className="absolute bottom-1.5 left-1.5 rounded-xs bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
              Source
            </span>
          </div>
          <div className="relative overflow-hidden rounded-md border border-line bg-black">
            {showMap ? <PoseMap /> : <Art seed="cn-source" ratio={3 / 4} className="opacity-40" />}
            <span className="absolute bottom-1.5 left-1.5 rounded-xs bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
              Preprocessed
            </span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" icon="upload" className="flex-1">
            Image
          </Button>
          <Button size="sm" icon="gallery" className="flex-1">
            From gallery
          </Button>
          <Button
            size="sm"
            icon="eye"
            variant={showMap ? "secondary" : "ghost"}
            onClick={() => setShowMap(!showMap)}
          >
            Map
          </Button>
        </div>
        <Field label="Preprocessor">
          <Select
            value={unit.preprocessor}
            onChange={(preprocessor) => setUnit({ preprocessor })}
            options={PREPROCESSORS}
            className="w-full"
          />
        </Field>
        <Field label="Model">
          <Select
            value={unit.model}
            onChange={(model) => setUnit({ model })}
            options={models}
            className="w-full"
          />
        </Field>
        <Slider
          label="Strength"
          value={unit.strength}
          onChange={(strength) => setUnit({ strength })}
          min={0}
          max={2}
          step={0.05}
          defaultValue={1}
        />
        <div className="grid grid-cols-2 gap-4">
          <Slider
            label="Start"
            value={unit.start}
            onChange={(start) => setUnit({ start: Math.min(start, unit.end) })}
            min={0}
            max={1}
            step={0.05}
          />
          <Slider
            label="End"
            value={unit.end}
            onChange={(end) => setUnit({ end: Math.max(end, unit.start) })}
            min={0}
            max={1}
            step={0.05}
          />
        </div>
        <Field label="Priority">
          <Segmented
            full
            size="sm"
            value={unit.mode}
            onChange={(mode) => setUnit({ mode })}
            options={[
              { value: "balanced", label: "Balanced" },
              { value: "prompt", label: "Prompt" },
              { value: "control", label: "ControlNet" },
            ]}
          />
        </Field>
      </div>
    </Collapsible>
  );
}

function PoseMap() {
  // A stick figure in OpenPose colors, as a stand-in for the preprocessor output.
  const bones: Array<[number, number, number, number, string]> = [
    [50, 22, 50, 40, "#ff0055"],
    [50, 40, 34, 44, "#ffaa00"],
    [34, 44, 28, 62, "#ffff00"],
    [50, 40, 66, 44, "#55ff00"],
    [66, 44, 72, 62, "#00ff55"],
    [50, 40, 44, 70, "#00ffff"],
    [44, 70, 42, 92, "#0055ff"],
    [50, 40, 56, 70, "#aa00ff"],
    [56, 70, 60, 92, "#ff00aa"],
  ];
  return (
    <svg viewBox="0 0 100 133" className="block w-full" aria-label="Pose map preview">
      <rect width="100" height="133" fill="#000" />
      {bones.map(([x1, y1, x2, y2, c], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={c}
          strokeWidth="3"
          strokeLinecap="round"
          opacity=".85"
        />
      ))}
      <circle cx="50" cy="18" r="6" fill="none" stroke="#ff0055" strokeWidth="2.5" />
    </svg>
  );
}
