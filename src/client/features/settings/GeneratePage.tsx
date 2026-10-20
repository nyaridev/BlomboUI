/**
 * Settings → Generate: the layout workflows show when they don't link one, the first-run tour,
 * and where prompt history and snippets come from. Saved to this profile.
 */
import { useGoToView } from "@client/lib/hooks";
import { useLayouts, useSettings, useUpdateSettings } from "@client/lib/queries";
import { Button, Field, Select } from "@client/ui";
import { PageHeader } from "./common";
import type { SettingsPage } from "./nav";

export function GeneratePage({ onGo }: { onGo: (p: SettingsPage) => void }) {
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const layouts = useLayouts().data;
  const go = useGoToView();
  const options = [
    ...(layouts?.builtins ?? []).map((l) => ({ value: l.id, label: l.name, group: "Built-in" })),
    ...(layouts?.custom ?? []).map((l) => ({ value: l.id, label: l.name, group: "This profile" })),
  ];
  return (
    <>
      <PageHeader title="Generate" text="How the Generate screen starts. Saved to this profile." />
      <div className="flex flex-col gap-8">
        <Field
          label="Default layout"
          layout="left"
          hint="What workflows show when they don't link a layout of their own. Customize on the Generate screen to make new ones."
        >
          <Select
            value={settings?.generate.layout ?? "default"}
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
            onClick={() => {
              update.mutate({ help: { tourDone: false } });
              go("generate");
            }}
          >
            Show the tour again
          </Button>
        </Field>
        <Field
          label="Prompt history"
          layout="left"
          hint="The clock next to the prompt lists prompts you generated with (from History → Generations) and your snippets."
        >
          <div className="flex gap-2">
            <Button variant="ghost" icon="history" onClick={() => go("history")}>
              Open History
            </Button>
            <Button variant="ghost" icon="text" onClick={() => onGo("autocomplete")}>
              Autocomplete settings
            </Button>
          </div>
        </Field>
      </div>
    </>
  );
}
