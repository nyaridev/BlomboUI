/**
 * Settings → Gallery: how tiles look, what the gallery leaves out (grids, stopped runs' images,
 * JPEG copies) and what plays on its own. Saved to this profile (`settings.gallery`).
 */
import { useSettings, useUpdateSettings } from "@client/lib/queries";
import { Field, Segmented, Slider, Switch } from "@client/ui";
import { useEffect, useState } from "react";
import { PageHeader, SettingsSection, useCurrentProfile } from "./common";

export function GalleryPage() {
  const profile = useCurrentProfile();
  const settings = useSettings().data?.gallery;
  const update = useUpdateSettings();
  const [size, setSize] = useState<number | null>(null);
  const tile = size ?? settings?.tileSize ?? 220;
  const [pageSize, setPageSize] = useState<number | null>(null);
  useEffect(() => {
    if (pageSize === null || pageSize === settings?.pageSize) return;
    const t = setTimeout(() => update.mutate({ gallery: { pageSize } }), 400);
    return () => clearTimeout(t);
  }, [pageSize, settings?.pageSize, update]);
  useEffect(() => {
    if (size === null || size === settings?.tileSize) return;
    const t = setTimeout(() => update.mutate({ gallery: { tileSize: size } }), 400);
    return () => clearTimeout(t);
  }, [size, settings?.tileSize, update]);
  return (
    <>
      <PageHeader title="Gallery" />
      <div className="flex flex-col gap-8">
        <SettingsSection title="Display" icon="layout-grid">
          <Field
            label="Layout"
            layout="left"
            hint="Justified rows keep every image's shape; the grid crops to squares."
          >
            <Segmented
              value={settings?.layout ?? "justified"}
              onChange={(layout) => update.mutate({ gallery: { layout } })}
              options={[
                { value: "justified", label: "Justified rows", icon: "layout-rows" },
                { value: "grid", label: "Square grid", icon: "layout-grid" },
              ]}
            />
          </Field>
          <Field
            label="Tile size"
            layout="left"
            hint="Row height (justified) or tile width (grid)."
          >
            <div className="w-72">
              <Slider
                value={tile}
                onChange={setSize}
                min={120}
                max={400}
                step={10}
                unit="px"
                label="Tile size"
              />
            </div>
          </Field>
          <Field
            label="Images at a time"
            layout="left"
            hint="How many images a list loads before you scroll for more. Fewer start faster on a slow disk."
          >
            <div className="w-72">
              <Slider
                value={pageSize ?? settings?.pageSize ?? 300}
                onChange={setPageSize}
                min={100}
                max={1000}
                step={50}
                label="Images at a time"
              />
            </div>
          </Field>
        </SettingsSection>
        <SettingsSection title="What the gallery shows" icon="filter">
          <Field
            label="Libraries"
            layout="left"
            hint="The gallery shows your output folders. Add, rename or reorder them in Folders."
          >
            <span className="pt-1.5 text-sm text-fg-2">
              {profile?.folders.outputs.length
                ? profile.folders.outputs.map((l) => l.name).join(", ")
                : "No output folder yet."}
            </span>
          </Field>
          <Field
            label="Exclude grids"
            layout="left"
            hint="Leaves out batch grids and the grids prompt matrices and XY plots make. They stay on disk."
          >
            <Switch
              checked={settings?.excludeGrids ?? true}
              onCheckedChange={(excludeGrids) => update.mutate({ gallery: { excludeGrids } })}
              label="Exclude grids"
            />
          </Field>
          <Field
            label="Exclude interrupted images"
            layout="left"
            hint="Leaves out images saved by a run you stopped before it finished. They stay on disk."
          >
            <Switch
              checked={settings?.excludeInterrupted ?? true}
              onCheckedChange={(excludeInterrupted) =>
                update.mutate({ gallery: { excludeInterrupted } })
              }
              label="Exclude interrupted images"
            />
          </Field>
          <Field
            label="Exclude JPEG copies"
            layout="left"
            hint="Leaves out the JPEG copies of large images (Settings → Saving). They stay on disk."
          >
            <Switch
              checked={settings?.excludeJpegCopies ?? true}
              onCheckedChange={(excludeJpegCopies) =>
                update.mutate({ gallery: { excludeJpegCopies } })
              }
              label="Exclude JPEG copies"
            />
          </Field>
          <Field
            label="Exclude long video parts"
            layout="left"
            hint="Leaves out the parts a long video is made of before its last one, which holds the whole video. They stay on disk."
          >
            <Switch
              checked={settings?.excludeSegments ?? true}
              onCheckedChange={(excludeSegments) => update.mutate({ gallery: { excludeSegments } })}
              label="Exclude long video parts"
            />
          </Field>
          <Field
            label="Play animations"
            layout="left"
            hint="Animated WebPs and GIFs move in their tiles. Off, they play when you point at them or open them."
          >
            <Switch
              checked={settings?.autoplayAnimated ?? true}
              onCheckedChange={(autoplayAnimated) =>
                update.mutate({ gallery: { autoplayAnimated } })
              }
              label="Play animations"
            />
          </Field>
          <Field
            label="Play videos"
            layout="left"
            hint="Videos play, muted, in their tiles. Off, they play when you point at them or open them."
          >
            <Switch
              checked={settings?.autoplayVideo ?? false}
              onCheckedChange={(autoplayVideo) => update.mutate({ gallery: { autoplayVideo } })}
              label="Play videos"
            />
          </Field>
        </SettingsSection>
      </div>
    </>
  );
}
