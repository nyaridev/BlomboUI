/**
 * Settings → Generate: the layout workflows show when they don't link one, the first-run tour,
 * when the image stage shows the sampling preview, and the prompt weight step (stored with
 * autocomplete, where the prompt editor reads it). Saved to this profile.
 */
import { useGoToView } from "@client/lib/hooks";
import { useLayouts, useSettings, useUpdateSettings } from "@client/lib/queries";
import { Button, Field, Segmented, Select, Slider, Switch } from "@client/ui";
import { type PreviewSettings, WEIGHT_STEPS } from "@shared/settings";
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
