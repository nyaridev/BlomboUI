/**
 * Settings → Saving: the format generated images are saved in, JPEG copies of large ones, where
 * each kind of file goes (patterns with placeholders, shared/savepaths.ts, and a table of the
 * placeholders), and batch grids. Saved to this profile (`settings.saving`).
 */
import { useSettings, useUpdateSettings } from "@client/lib/queries";
import { Button, Field, NumberField, Segmented, Slider, Switch, TextField } from "@client/ui";
import {
  checkPattern,
  DEFAULT_PATHS,
  PLACEHOLDERS,
  resolvePattern,
  type SaveKind,
  timeVars,
} from "@shared/savepaths";
import { type ImageFormat, SavingSettings } from "@shared/settings";
import { useEffect, useState } from "react";
import { PageHeader, SettingsSection } from "./common";

const DEFAULTS = SavingSettings.parse({});
const FORMATS: Array<{ value: ImageFormat; label: string }> = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
];

const KIND_INFO: Record<SaveKind, { label: string; hint: string; ext: string }> = {
  images: {
    label: "Images",
    hint: "What a run saves. ComfyUI writes its counter at the end, so the name ends with [number].",
    ext: ".png",
  },
  grids: {
    label: "Grids",
    hint: "Batch grids, prompt matrices and XY plots. Needs a folder with a fixed name, so the gallery can leave grids out.",
    ext: ".png",
  },
  interrupted: {
    label: "Stopped runs",
    hint: "Where the images of a run you stopped move to. Needs a folder with a fixed name.",
    ext: ".png",
  },
  jpegCopies: {
    label: "JPEG copies",
    hint: "Copies of large images. Needs a folder with a fixed name.",
    ext: ".jpg",
  },
};

/** Sample values the previews fill in. */
const SAMPLE = {
  ...timeVars(new Date()),
  workflow: "illustrious-xl",
  seed: 1234567890,
  width: 832,
  height: 1216,
  model: "illustriousXL_v01",
  number: "00001",
  kind: "batch",
  name: "blombo_00001_",
};

export function SavingPage() {
  const saving = useSettings().data?.saving ?? DEFAULTS;
  const update = useUpdateSettings();
  const set = (patch: Record<string, unknown>) => update.mutate({ saving: patch });
  const lossy = saving.format !== "png";
  return (
    <>
      <PageHeader title="Saving" />
      <div className="flex flex-col gap-8">
        <SettingsSection title="Images" icon="image">
          <Field
            label="Format"
            layout="left"
            hint={
              lossy
                ? "ComfyUI saves a PNG and Blombo converts it right away, keeping the prompt and settings. A very large workflow may not fit in a JPEG or WebP (64 KB): the gallery can still read the prompt."
                : "PNG keeps every pixel and all the generation data."
            }
          >
            <Segmented<ImageFormat>
              size="sm"
              className="w-fit justify-self-start"
              label="Image format"
              value={saving.format}
              onChange={(format) => set({ format })}
              options={FORMATS}
            />
          </Field>
          <Field
            label="Quality"
            layout="left"
            hint="JPEG and WebP only. 95 looks like the original."
          >
            <QualitySlider
              value={saving.quality}
              disabled={!lossy}
              onChange={(quality) => set({ quality })}
            />
          </Field>
        </SettingsSection>

        <SettingsSection title="JPEG copies" icon="copy">
          <Field
            label="Large images"
            layout="left"
            hint="Saves a JPEG beside an image whose file is bigger than this, easier to share. The gallery leaves the copies out unless Settings → Gallery says otherwise."
          >
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 text-sm text-fg-2">
                <Switch
                  checked={saving.jpegCopy.enabled}
                  onCheckedChange={(enabled) => set({ jpegCopy: { enabled } })}
                  label="Save a JPEG copy of large images"
                />
                Save a JPEG copy of large images
              </label>
              <div className="flex items-center gap-2 text-sm text-fg-2">
                Bigger than
                <NumberField
                  value={saving.jpegCopy.overKb}
                  onChange={(overKb) => set({ jpegCopy: { overKb } })}
                  min={256}
                  max={65536}
                  step={256}
                  label="Size in kilobytes"
                  className="w-28"
                  disabled={!saving.jpegCopy.enabled}
                />
                KB
              </div>
            </div>
          </Field>
          <Field label="Quality" layout="left">
            <QualitySlider
              value={saving.jpegCopy.quality}
              disabled={!saving.jpegCopy.enabled}
              onChange={(quality) => set({ jpegCopy: { quality } })}
            />
          </Field>
        </SettingsSection>

        <SettingsSection title="File names and folders" icon="folder">
          {(Object.keys(KIND_INFO) as SaveKind[]).map((kind) => (
            <PatternField
              key={kind}
              kind={kind}
              value={saving.paths[kind]}
              images={saving.paths.images}
              ext={
                kind === "images" || kind === "interrupted"
                  ? `.${saving.format === "jpeg" ? "jpg" : saving.format}`
                  : kind === "grids"
                    ? `.${saving.grids.format === "jpeg" ? "jpg" : saving.grids.format}`
                    : KIND_INFO[kind].ext
              }
              onSave={(value) => set({ paths: { [kind]: value } })}
            />
          ))}
          <Placeholders />
        </SettingsSection>

        <SettingsSection title="Grids" icon="layout-grid">
          <Field
            label="Batch grids"
            layout="left"
            hint="When one click makes several images (batch size or count), they're also saved as one grid, as square as they go."
          >
            <div className="flex flex-col gap-3">
              <Toggle
                checked={saving.grids.batch}
                onChange={(batch) => set({ grids: { batch } })}
                label="Save a grid of each batch"
              />
              <Toggle
                checked={saving.grids.onCancel}
                disabled={!saving.grids.batch}
                onChange={(onCancel) => set({ grids: { onCancel } })}
                label="Also when the batch is stopped (of the finished images)"
              />
              <Toggle
                checked={saving.grids.includeInterrupted}
                disabled={!saving.grids.batch}
                onChange={(includeInterrupted) => set({ grids: { includeInterrupted } })}
                label="Include images of a stopped run"
              />
            </div>
          </Field>
          <Field
            label="Images per grid"
            layout="left"
            hint="A bigger batch makes several grids. 64 is an 8 × 8 grid."
          >
            <div className="w-72 max-lg:w-full">
              <Slider
                value={saving.grids.maxImages}
                onChange={(maxImages) => set({ grids: { maxImages } })}
                min={4}
                max={100}
                label="Images per grid"
                disabled={!saving.grids.batch}
              />
            </div>
          </Field>
          <Field
            label="Format"
            layout="left"
            hint="Every grid: batch grids, prompt matrices and XY plots."
          >
            <div className="flex flex-col gap-3">
              <Segmented<ImageFormat>
                size="sm"
                className="w-fit"
                label="Grid format"
                value={saving.grids.format}
                onChange={(format) => set({ grids: { format } })}
                options={FORMATS}
              />
              <QualitySlider
                value={saving.grids.quality}
                disabled={saving.grids.format === "png"}
                onChange={(quality) => set({ grids: { quality } })}
              />
            </div>
          </Field>
        </SettingsSection>
      </div>
    </>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-fg-2">
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} label={label} />
      {label}
    </label>
  );
}

function QualitySlider({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  // Saved when the slider settles, not on every step.
  const [draft, setDraft] = useState<number | null>(null);
  useEffect(() => {
    if (draft === null || draft === value) return;
    const t = setTimeout(() => onChange(draft), 400);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);
  return (
    <div className="w-72 max-lg:w-full">
      <Slider
        value={draft ?? value}
        onChange={setDraft}
        min={50}
        max={100}
        label="Quality"
        disabled={disabled}
      />
    </div>
  );
}

/** One pattern: edited as text, saved on Enter or leaving the field when it's usable. */
function PatternField({
  kind,
  value,
  images,
  ext,
  onSave,
}: {
  kind: SaveKind;
  value: string;
  images: string;
  ext: string;
  onSave: (value: string) => void;
}) {
  const info = KIND_INFO[kind];
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const error = checkPattern(kind, draft, kind === "images" ? undefined : images);
  const save = () => {
    if (!error && draft.trim() !== value) onSave(draft.trim());
  };
  return (
    <Field
      label={info.label}
      layout="left"
      error={error}
      hint={error ? undefined : info.hint}
      action={
        value !== DEFAULT_PATHS[kind] ? (
          <Button variant="ghost" size="sm" onClick={() => onSave(DEFAULT_PATHS[kind])}>
            Use the default
          </Button>
        ) : null
      }
    >
      {(id) => (
        <div className="flex w-full max-w-lg flex-col gap-1.5">
          <TextField
            id={id}
            mono
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setDraft(value);
            }}
            aria-invalid={error ? true : undefined}
            spellCheck={false}
          />
          {error ? null : (
            <span className="truncate font-mono text-xs text-fg-3" title="With sample values">
              {resolvePattern(
                kind === "images" ? draft.trim().replace(/\[number\]$/, "[number]_") : draft,
                SAMPLE,
              )}
              {ext}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}

function Placeholders() {
  const kinds = (k: readonly SaveKind[]) =>
    k.length === 4 ? "All" : k.map((x) => KIND_INFO[x].label).join(", ");
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-fg">Placeholders</span>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-sunken text-xs text-fg-3">
            <tr>
              <th className="px-3 py-2 font-medium">Placeholder</th>
              <th className="px-3 py-2 font-medium">What it is</th>
              <th className="px-3 py-2 font-medium max-lg:hidden">Example</th>
              <th className="px-3 py-2 font-medium max-lg:hidden">Works in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {PLACEHOLDERS.map((p) => (
              <tr key={p.token}>
                <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap text-accent-ink">
                  [{p.token}]
                </td>
                <td className="px-3 py-1.5 text-fg-2">{p.label}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-fg-3 max-lg:hidden">
                  {p.example}
                </td>
                <td className="px-3 py-1.5 text-xs text-fg-3 max-lg:hidden">{kinds(p.kinds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-3">
        Use / between folders. Folders start in the main output folder; the extension comes from the
        format.
      </p>
    </div>
  );
}
