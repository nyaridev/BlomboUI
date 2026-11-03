/**
 * Settings → Generate: the layout workflows show when they don't link one, the first-run tour,
 * the Size picker's Set list, the model pickers (what the workflow uses first, renames reaching
 * wildcard files),
 * when the image stage shows the sampling preview, and the prompt weight step (stored with
 * autocomplete, where the prompt editor reads it). Saved to this profile.
 */
import { useGoToView } from "@client/lib/hooks";
import { useLayouts, useSamplerLists, useSettings, useUpdateSettings } from "@client/lib/queries";
import {
  Button,
  Checkbox,
  Field,
  IconButton,
  NumberField,
  Segmented,
  Select,
  Slider,
  Switch,
} from "@client/ui";
import { GenerateSettings, type PreviewSettings, WEIGHT_STEPS } from "@shared/settings";
import { formatSize, landscapeSize, parseSize, snapDim } from "@shared/sizes";
import { useState } from "react";
import { samplerLabel, schedulerLabel } from "../generate/labels";
import { PageHeader, SettingsSection } from "./common";

export function GeneratePage() {
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const layouts = useLayouts().data;
  const go = useGoToView();
  const options = [
    ...(layouts?.builtins ?? []).map((l) => ({ value: l.id, label: l.name, group: "Built-in" })),
    ...(layouts?.custom ?? []).map((l) => ({ value: l.id, label: l.name, group: "This profile" })),
  ];
  // A default that's gone (a deleted layout, the old built-in "compact") shows as what the
  // server falls back to.
  const saved = settings?.generate.layout ?? "default";
  const layout = !layouts || options.some((o) => o.value === saved) ? saved : "default";
  const preview = settings?.generate.preview;
  const setPreview = (patch: Partial<PreviewSettings>) =>
    update.mutate({ generate: { preview: patch } });
  const off = !(preview?.show ?? true);
  const samplers = useSamplerLists();
  return (
    <>
      <PageHeader title="Generate" />
      <div className="flex flex-col gap-8">
        <SettingsSection title="Generate screen" icon="generate">
          <Field
            label="Default layout"
            layout="left"
            hint="What workflows show when they don't link a layout of their own. Customize on the Generate screen to make new ones."
          >
            <Select
              value={layout}
              onChange={(layout) => update.mutate({ generate: { layout } })}
              options={options}
              className="w-72"
              label="Default layout"
            />
          </Field>
          <Field
            label="Tour"
            layout="left"
            hint="A short walk through the Generate screen: workflows, models, prompts, the Generate button and the image stage."
          >
            <Button
              icon="play"
              className="w-fit"
              onClick={() => {
                update.mutate({ help: { tourDone: false } });
                go("generate");
              }}
            >
              Show the tour again
            </Button>
          </Field>
          <SetResolutions
            list={settings?.generate.setResolutions ?? DEFAULT_SET}
            onChange={(setResolutions) => update.mutate({ generate: { setResolutions } })}
          />
        </SettingsSection>
        <SettingsSection title="Preview" icon="eye">
          <Field
            label="While generating"
            layout="left"
            hint="Show ComfyUI's picture of the image as it samples, in place of the result."
          >
            <label className="flex items-center gap-3 text-sm text-fg-2">
              <Switch
                checked={!off}
                onCheckedChange={(show) => setPreview({ show })}
                label="Show the preview"
              />
              Show the preview
            </label>
          </Field>
          <Field label="Every" layout="left" hint="A new preview every this many steps.">
            <div className="w-72">
              <Slider
                value={preview?.every ?? 4}
                onChange={(every) => setPreview({ every })}
                min={1}
                max={50}
                unit=" steps"
                label="Steps"
                disabled={off}
              />
            </div>
          </Field>
          <Field
            label="First one after"
            layout="left"
            hint="The first preview is the next multiple of Every from here: every 4 after 8 shows at 8, every 4 after 10 at 12."
          >
            <div className="flex w-72 flex-col gap-3">
              <Slider
                value={preview?.after ?? 8}
                onChange={(after) => setPreview({ after })}
                min={1}
                max={50}
                unit=" steps"
                label="Steps"
                disabled={off}
              />
              <label className="flex items-center gap-3 text-sm text-fg-2">
                <Switch
                  checked={preview?.waitFirstOnly ?? true}
                  disabled={off}
                  onCheckedChange={(waitFirstOnly) => setPreview({ waitFirstOnly })}
                  label="Only wait on the first run"
                />
                Only wait on the first run of a click
              </label>
            </div>
          </Field>
          <Field
            label="Last step"
            layout="left"
            hint="Also show the last step, even when it isn't on the interval."
          >
            <label className="flex items-center gap-3 text-sm text-fg-2">
              <Switch
                checked={preview?.lastStep ?? true}
                disabled={off}
                onCheckedChange={(lastStep) => setPreview({ lastStep })}
                label="Show the last step"
              />
              Show the last step
            </label>
          </Field>
        </SettingsSection>
        <SettingsSection title="Model pickers" icon="models">
          <Field
            label="Used first"
            layout="left"
            hint="The checkpoints, LoRAs and wildcards the workflow uses come first in the pickers and stay listed whatever the search or base models (the eye in their top bar)."
          >
            <label className="flex items-center gap-3 text-sm text-fg-2">
              <Switch
                checked={settings?.generate.pickerShowLoaded ?? true}
                onCheckedChange={(pickerShowLoaded) =>
                  update.mutate({ generate: { pickerShowLoaded } })
                }
                label="Show what the workflow uses first"
              />
              Show what the workflow uses first
            </label>
          </Field>
          <Field
            label="Renames"
            layout="left"
            hint="Renaming a LoRA, a wildcard or their folder from a picker also changes full <lora:…> and __wildcard__ references to it in your wildcard files."
          >
            <label className="flex items-center gap-3 text-sm text-fg-2">
              <Switch
                checked={settings?.generate.renameRefs ?? true}
                onCheckedChange={(renameRefs) => update.mutate({ generate: { renameRefs } })}
                label="Update references in wildcard files"
              />
              Update references in wildcard files
            </label>
          </Field>
        </SettingsSection>
        <SettingsSection title="Samplers and schedulers" icon="sliders">
          <ChoiceList
            label="Samplers"
            names={samplers.data?.samplers ?? []}
            hidden={settings?.generate.hiddenSamplers ?? []}
            format={samplerLabel}
            loading={samplers.isLoading}
            available={samplers.data?.available ?? true}
            onChange={(hiddenSamplers) => update.mutate({ generate: { hiddenSamplers } })}
          />
          <ChoiceList
            label="Schedulers"
            names={samplers.data?.schedulers ?? []}
            hidden={settings?.generate.hiddenSchedulers ?? []}
            format={schedulerLabel}
            loading={samplers.isLoading}
            available={samplers.data?.available ?? true}
            onChange={(hiddenSchedulers) => update.mutate({ generate: { hiddenSchedulers } })}
          />
        </SettingsSection>
        <SettingsSection title="Prompts" icon="text">
          <Field
            label="Weight step"
            layout="left"
            hint="How much Ctrl+↑ / Ctrl+↓ changes (tag:1.1) weights and <lora:name:0.8> strengths at the cursor."
          >
            <Segmented
              size="sm"
              className="w-fit justify-self-start"
              label="Weight step"
              value={String(settings?.autocomplete.weightStep ?? 0.05)}
              onChange={(v) => update.mutate({ autocomplete: { weightStep: Number(v) } })}
              options={WEIGHT_STEPS.map((n) => ({ value: String(n), label: String(n) }))}
            />
          </Field>
        </SettingsSection>
      </div>
    </>
  );
}

const DEFAULT_SET = GenerateSettings.parse({}).setResolutions;

/**
 * The Size picker's Set list: each size with a remove button, and width × height to add one.
 * Sizes are kept long side first (Generate turns them vertical) and snap to 8 px.
 */
function SetResolutions({
  list,
  onChange,
}: {
  list: string[];
  onChange: (list: string[]) => void;
}) {
  const [w, setW] = useState(1024);
  const [h, setH] = useState(1024);
  const adding = formatSize(landscapeSize({ w: snapDim(w), h: snapDim(h) }));
  const isDefault = list.join() === DEFAULT_SET.join();
  return (
    <Field
      label="Set resolutions"
      layout="left"
      hint="The sizes the Size picker's Set mode offers, horizontal or vertical."
    >
      <div className="flex w-full max-w-md flex-col gap-3">
        {list.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {list.map((key) => {
              const size = parseSize(key);
              const text = size ? `${size.w} × ${size.h}` : key;
              return (
                <li
                  key={key}
                  className="flex h-7 items-center gap-0.5 rounded-md border border-line bg-field pl-2 font-mono text-xs text-fg-2 tabular"
                >
                  {text}
                  <IconButton
                    icon="x"
                    size="xs"
                    label={`Remove ${text}`}
                    onClick={() => onChange(list.filter((k) => k !== key))}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-fg-3">
            No sizes: Set mode only shows the current one. Add some below.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <NumberField
            value={w}
            onChange={setW}
            min={64}
            max={4096}
            step={8}
            label="Width"
            className="w-28"
          />
          <span className="text-fg-3">×</span>
          <NumberField
            value={h}
            onChange={setH}
            min={64}
            max={4096}
            step={8}
            label="Height"
            className="w-28"
          />
          <Button
            icon="plus"
            disabled={list.includes(adding) || list.length >= 40}
            title={list.includes(adding) ? "That size is already in the list" : undefined}
            onClick={() => onChange([...list, adding])}
          >
            Add
          </Button>
          {isDefault ? null : (
            <Button variant="ghost" onClick={() => onChange([...DEFAULT_SET])}>
              Use the defaults
            </Button>
          )}
        </div>
      </div>
    </Field>
  );
}

/**
 * One of ComfyUI's lists as checkboxes: unticked ones are hidden from the Generate pickers.
 * Names saved as hidden that this ComfyUI doesn't have stay hidden (another ComfyUI may).
 */
function ChoiceList({
  label,
  names,
  hidden,
  format,
  loading,
  available,
  onChange,
}: {
  label: string;
  names: string[];
  hidden: string[];
  format: (name: string) => string;
  loading: boolean;
  available: boolean;
  onChange: (hidden: string[]) => void;
}) {
  const off = new Set(hidden);
  const shownCount = names.filter((n) => !off.has(n)).length;
  return (
    <Field
      label={label}
      hint={
        !available
          ? "Start ComfyUI to see its list."
          : `Untick the ones you don't use: they leave the pickers on Generate and in the stages. ${shownCount} of ${names.length} shown.`
      }
      action={
        hidden.length ? (
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>
            Show all
          </Button>
        ) : null
      }
    >
      {loading ? null : names.length ? (
        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 rounded-md border border-line bg-sunken p-3 max-lg:grid-cols-2">
          {names.map((n) => (
            <Checkbox
              key={n}
              checked={!off.has(n)}
              onCheckedChange={(on) =>
                onChange(on ? hidden.filter((h) => h !== n) : [...hidden, n])
              }
              label={<span title={n}>{format(n)}</span>}
            />
          ))}
        </div>
      ) : null}
    </Field>
  );
}
