/**
 * Smooth motion (video workflows): ComfyUI draws frames between the video's frames with RIFE or
 * FILM, and the frame rate goes up by the same factor, so the video keeps its length and sound.
 */
import { Field, Segmented, Select } from "@client/ui";
import { useStage, useValues } from "../../state";
import { useRoleBinding } from "../../workflow";
import { modelOptions, problemSummary, StageFrame, StageNotices, useStageStatus } from "./common";

const MULTIPLIERS = [2, 3, 4] as const;

export function SmoothStage() {
  const [s, set] = useStage("smooth");
  const status = useStageStatus("smooth");
  const fpsId = useRoleBinding("video.fps")?.id;
  const fps = useValues((st) => (fpsId ? Number(st.values[fpsId]) : Number.NaN));
  const model = s.model.replace(/\.(safetensors|pth|pt)$/i, "");
  const rate = Number.isFinite(fps)
    ? `${fps} → ${Math.round(fps * s.multiplier * 100) / 100} fps`
    : `${s.multiplier}× frames`;
  const fallback = status?.problems.length ? problemSummary(status) : null;
  return (
    <StageFrame
      title="Smooth motion"
      icon="wave"
      subtitle={fallback ?? `${model} · ${rate}`}
      enabled={s.enabled}
      onEnabledChange={(enabled) => set({ enabled })}
    >
      <div className="flex flex-col gap-3.5">
        <StageNotices status={status} />
        <p className="text-xs text-fg-3">
          Draws frames between the frames, so motion looks smoother. The video keeps its length and
          sound; only the frame rate goes up ({rate}).
        </p>
        <Field label="Frames per frame">
          <Segmented
            full
            size="sm"
            value={String(s.multiplier)}
            onChange={(v) => set({ multiplier: Number(v) })}
            options={MULTIPLIERS.map((m) => ({ value: String(m), label: `${m}×` }))}
          />
        </Field>
        <Field label="Model" hint="RIFE is fast; FILM is slower and handles big motion better.">
          <Select
            value={s.model}
            onChange={(next) => set({ model: next })}
            options={modelOptions(status?.choices.model, s.model)}
            aria-label="Interpolation model"
          />
        </Field>
      </div>
    </StageFrame>
  );
}
