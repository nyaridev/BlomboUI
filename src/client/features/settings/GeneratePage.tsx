/**
 * Settings → Generate: the layout workflows show when they don't link one, the prompt weight
 * step (stored with autocomplete, where the prompt editor reads it) and the first-run tour.
 * Saved to this profile.
 */
import { useGoToView } from "@client/lib/hooks";
import { useLayouts, useSettings, useUpdateSettings } from "@client/lib/queries";
import { Button, Field, Segmented, Select } from "@client/ui";
import { WEIGHT_STEPS } from "@shared/settings";
import { PageHeader } from "./common";

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
  return (
    <>
      <PageHeader title="Generate" />
      <div className="flex flex-col gap-8">
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
        <Field
          label="Tour"
          layout="left"
          hint="A short walk through the Generate screen: workflows, models, prompts, the Generate button and the image stage."
        >
          <Button
            icon="play"
            onClick={() => {
              update.mutate({ help: { tourDone: false } });
              go("generate");
            }}
          >
            Show the tour again
          </Button>
        </Field>
      </div>
    </>
  );
}
