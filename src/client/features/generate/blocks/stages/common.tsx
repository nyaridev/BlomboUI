/**
 * What every stage block shares: the stage report (what's missing for this workflow, and
 * ComfyUI's current choices for each field), the notices that say what to do about it, and
 * the inherited fields (steps, CFG, sampler, scheduler, prompts) that follow the base workflow
 * until unlinked.
 */
import { api } from "@client/lib/api";
import { useDebounced, useGoToView } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import { openWindow } from "@client/lib/platform";
import { queryClient, useStageReport } from "@client/lib/queries";
import { Button, InheritRow, Notice, NumberField, Select, type SelectOption } from "@client/ui";
import type { ModelKind } from "@shared/constants";
import type { StoreCategory } from "@shared/manager";
import type { StageId } from "@shared/workflow/roles";
import {
  INHERIT_ROLES,
  type InheritField,
  type StageProblem,
  type StageStatus,
} from "@shared/workflow/stages";
import { useModelsNav } from "../../../models/nav";
import { samplerLabel } from "../../labels";
import { PromptEditor } from "../../PromptEditor";
import { useValues } from "../../state";
import { useRoleBinding } from "../../workflow";

/** The checks for every stage of the active workflow, following its settings (debounced). */
export function useStageStatuses(): { statuses: StageStatus[]; checked: boolean } {
  const workflowId = useValues((s) => s.workflowId);
  const stages = useDebounced(
    useValues((s) => s.stages),
    350,
  );
  const report = useStageReport(workflowId, stages);
  return { statuses: report.data?.stages ?? [], checked: report.data?.checked ?? false };
}

export function useStageStatus(stage: StageId): StageStatus | undefined {
  return useStageStatuses().statuses.find((s) => s.stage === stage);
}

const MANAGER_CATEGORY: Partial<Record<ModelKind, StoreCategory>> = {
  ultralytics: "detectors",
  sams: "detectors",
  controlnet: "controlnet",
  upscale_models: "upscalers",
};

const MANAGER_QUERY: Partial<Record<ModelKind, string>> = {
  ultralytics: "yolo",
  sams: "sam",
};

/** One problem, with the action that fixes it. */
function ProblemNotice({ problem }: { problem: StageProblem }) {
  const goTo = useGoToView();
  const comfyUrl = useLive((s) => s.comfy?.url ?? null);
  const kind = problem.modelKind;
  const category = kind ? MANAGER_CATEGORY[kind] : undefined;
  const actions =
    problem.code === "missing_nodes" ? (
      <>
        {comfyUrl ? (
          <Button size="sm" icon="external" onClick={() => void openWindow(comfyUrl, "ComfyUI")}>
            Open ComfyUI
          </Button>
        ) : null}
        {problem.packs?.map((p) => (
          <Button
            key={p.url}
            size="sm"
            variant="ghost"
            icon="globe"
            onClick={() => window.open(p.url, "_blank", "noopener")}
          >
            {p.name}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon="refresh"
          onClick={async () => {
            await api.comfyRefresh().catch(() => undefined);
            void queryClient.invalidateQueries({ queryKey: ["stage-report"] });
          }}
        >
          Check again
        </Button>
      </>
    ) : category && (problem.code === "missing_model" || problem.code === "pick_model") ? (
      <Button
        size="sm"
        icon="store"
        onClick={() => {
          useModelsNav.getState().showManager(category, (kind && MANAGER_QUERY[kind]) ?? "");
          goTo("models");
        }}
      >
        Find in Manager
      </Button>
    ) : null;
  const tone = problem.code === "pick_model" || problem.code === "no_image" ? "info" : "warning";
  return (
    <Notice tone={tone} actions={actions}>
      {problem.message}
    </Notice>
  );
}

/** The problems of a stage (or one unit of it), each with what to do. */
export function StageNotices({
  status,
  unit,
}: {
  status: StageStatus | undefined;
  /** Show the stage-wide problems plus this unit's; undefined: all of them. */
  unit?: string;
}) {
  const problems = (status?.problems ?? []).filter(
    (p) => unit === undefined || !p.unit || p.unit === unit,
  );
  if (!problems.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {problems.map((p, i) => (
        <ProblemNotice key={`${p.code}-${i}`} problem={p} />
      ))}
    </div>
  );
}

/** One line for the collapsed header when something's missing. */
export function problemSummary(status: StageStatus | undefined): string | null {
  const p = status?.problems ?? [];
  if (!p.length) return null;
  if (p.some((x) => x.code === "missing_nodes")) return "Needs custom nodes";
  if (p.some((x) => x.code === "missing_port")) return "Can't attach to this workflow";
  if (p.some((x) => x.code === "no_image")) return "Add an image";
  if (p.some((x) => x.code === "missing_model")) return "A model is missing";
  if (p.some((x) => x.code === "pick_model")) return "Pick a model";
  if (p.some((x) => x.code === "no_size")) return "Use Target size";
  return p[0]?.message ?? null;
}

/* ── inherited fields ──────────────────────────────────────────────────── */

export interface Inheriting {
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  prompt: string;
  negative: string;
  unlinked: InheritField[];
}

/** The base workflow's value for an inherited field, for the dimmed "Base" text. */
function useBaseValue(field: InheritField): { value: unknown; options: string[] | undefined } {
  const binding = useRoleBinding(INHERIT_ROLES[field]);
  const value = useValues((s) => (binding ? s.values[binding.id] : undefined));
  return { value, options: binding?.options };
}

function toggle(unlinked: InheritField[], field: InheritField, on: boolean): InheritField[] {
  const rest = unlinked.filter((f) => f !== field);
  return on ? [...rest, field] : rest;
}

export function InheritNumber({
  field,
  label,
  settings,
  onChange,
  min,
  max,
  step,
  fallback,
}: {
  field: "steps" | "cfg";
  label: string;
  settings: Inheriting;
  onChange: (patch: Partial<Inheriting>) => void;
  min: number;
  max: number;
  step: number;
  /** Shown when the workflow has nothing to inherit (a package default). */
  fallback?: number;
}) {
  const base = useBaseValue(field);
  const shown = base.value ?? fallback ?? settings[field];
  return (
    <InheritRow
      label={label}
      inherited={String(shown)}
      overridden={settings.unlinked.includes(field)}
      onOverride={(on) =>
        onChange({
          unlinked: toggle(settings.unlinked, field, on),
          // Unlinking starts from the value it showed.
          ...(on && typeof shown === "number" ? { [field]: shown } : {}),
        })
      }
    >
      <NumberField
        value={settings[field]}
        onChange={(v) => onChange({ [field]: v })}
        min={min}
        max={max}
        step={step}
        label={label}
      />
    </InheritRow>
  );
}

export function InheritChoice({
  field,
  label,
  settings,
  onChange,
  choices,
  fallback,
}: {
  field: "sampler" | "scheduler";
  label: string;
  settings: Inheriting;
  onChange: (patch: Partial<Inheriting>) => void;
  /** ComfyUI's options for this field (from the stage report), when the base has none. */
  choices: string[] | undefined;
  fallback?: string;
}) {
  const base = useBaseValue(field);
  const options = base.options ?? choices ?? [settings[field]];
  const shown = typeof base.value === "string" ? base.value : (fallback ?? settings[field]);
  const label_ = (v: string) => (field === "sampler" ? samplerLabel(v) : v);
  return (
    <InheritRow
      label={label}
      inherited={label_(shown)}
      overridden={settings.unlinked.includes(field)}
      onOverride={(on) =>
        onChange({
          unlinked: toggle(settings.unlinked, field, on),
          ...(on ? { [field]: shown } : {}),
        })
      }
    >
      <Select
        value={settings[field]}
        onChange={(v) => onChange({ [field]: v })}
        options={options.map((v): SelectOption<string> => ({ value: v, label: label_(v) }))}
        className="w-full"
        label={label}
      />
    </InheritRow>
  );
}

export function InheritPrompt({
  field,
  label,
  settings,
  onChange,
  placeholder,
}: {
  field: "prompt" | "negative";
  label: string;
  settings: Inheriting;
  onChange: (patch: Partial<Inheriting>) => void;
  placeholder: string;
}) {
  const base = useBaseValue(field);
  const text = typeof base.value === "string" ? base.value.trim() : "";
  return (
    <InheritRow
      label={label}
      inherited={
        <span className="truncate font-sans text-xs">
          {text ? `Same as the main ${field === "prompt" ? "prompt" : "negative"}` : "Empty"}
        </span>
      }
      overridden={settings.unlinked.includes(field)}
      onOverride={(on) => onChange({ unlinked: toggle(settings.unlinked, field, on) })}
    >
      <PromptEditor
        label={label}
        value={settings[field]}
        onChange={(v) => onChange({ [field]: v })}
        minRows={2}
        placeholder={placeholder}
        className="h-[72px]"
      />
    </InheritRow>
  );
}

/** A model choice from ComfyUI's list for a stage field, with "None" when it's optional. */
export function modelOptions(
  names: string[] | undefined,
  current: string,
  none?: string,
): SelectOption<string>[] {
  const list = names ?? [];
  const out: SelectOption<string>[] = none ? [{ value: "", label: none }] : [];
  for (const n of list)
    out.push({ value: n, label: n.replace(/\.(pt|pth|safetensors|bin|ckpt)$/i, "") });
  if (current && !list.includes(current))
    out.push({ value: current, label: `${current} (missing)`, group: "Not found" });
  return out;
}
