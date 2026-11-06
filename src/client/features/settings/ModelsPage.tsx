/**
 * Settings → Models: how model pictures are saved (Civitai downloads, Set picture…, the
 * thumbnails script): the card picture's size, format and quality, whether the full-size original
 * is kept, and whether animated pictures stay animated. Saved to this profile (`settings.models`).
 */
import { useSettings, useUpdateSettings } from "@client/lib/queries";
import { Field, Segmented, Slider, Switch } from "@client/ui";
import { type ImageFormat, ModelSettings, type PictureSettings } from "@shared/settings";
import { useEffect, useState } from "react";
import { PageHeader, SettingsSection } from "./common";

const DEFAULTS = ModelSettings.parse({}).pictures;

export function ModelsPage() {
  const pictures = useSettings().data?.models.pictures ?? DEFAULTS;
  const update = useUpdateSettings();
  const set = (patch: Partial<PictureSettings>) => update.mutate({ models: { pictures: patch } });
  // A square picture's side at this size, to make megapixels concrete.
  const side = Math.round(Math.sqrt(pictures.megapixels * 1e6));
  return (
    <>
      <PageHeader title="Models" />
      <div className="flex flex-col gap-8">
        <SettingsSection title="Pictures" icon="image">
          <p className="text-xs text-fg-3">
            For pictures saved from now on: Civitai downloads, Set picture… and the thumbnails
            script. Pictures you already have stay as they are.
          </p>
          <Field
            label="Card picture size"
            layout="left"
            hint={`About ${side} × ${side} for a square picture. Smaller pictures aren't enlarged.`}
          >
            <Settled
              value={Math.round(pictures.megapixels * 100)}
              onChange={(v) => set({ megapixels: v / 100 })}
            >
              {(value, onChange) => (
                <Slider
                  value={value}
                  onChange={onChange}
                  min={5}
                  max={200}
                  step={5}
                  format={(v) => `${(v / 100).toFixed(2)} MP`}
                  label="Card picture size"
                />
              )}
            </Settled>
          </Field>
          <Field label="Format" layout="left" hint="JPEG is smallest; PNG keeps every pixel.">
            <Segmented<ImageFormat>
              size="sm"
              className="w-fit justify-self-start"
              label="Picture format"
              value={pictures.format}
              onChange={(format) => set({ format })}
              options={[
                { value: "jpeg", label: "JPEG" },
                { value: "webp", label: "WebP" },
                { value: "png", label: "PNG" },
              ]}
            />
          </Field>
          <Field label="Quality" layout="left" hint="JPEG and WebP, and animated pictures.">
            <Settled value={pictures.quality} onChange={(quality) => set({ quality })}>
              {(value, onChange) => (
                <Slider value={value} onChange={onChange} min={50} max={100} label="Quality" />
              )}
            </Settled>
          </Field>
          <Field
            label="Full-size original"
            layout="left"
            hint="Keeps the original beside the card picture (global_raw), for the model info dialog and to make new card pictures later."
          >
            <label className="flex items-center gap-3 text-sm text-fg-2">
              <Switch
                checked={pictures.keepRaw}
                onCheckedChange={(keepRaw) => set({ keepRaw })}
                label="Keep the full-size original"
              />
              Keep the full-size original
            </label>
          </Field>
          <Field
            label="Animated pictures"
            layout="left"
            hint="A GIF or animated WebP becomes a moving WebP card picture. Off, the card shows its first frame."
          >
            <label className="flex items-center gap-3 text-sm text-fg-2">
              <Switch
                checked={pictures.animated}
                onCheckedChange={(animated) => set({ animated })}
                label="Keep them animated"
              />
              Keep them animated (WebP)
            </label>
          </Field>
        </SettingsSection>
      </div>
    </>
  );
}

/** A slider value that's saved once it settles, not on every step. */
function Settled({
  value,
  onChange,
  children,
}: {
  value: number;
  onChange: (v: number) => void;
  children: (value: number, onChange: (v: number) => void) => React.ReactNode;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  useEffect(() => {
    if (draft === null || draft === value) return;
    const t = setTimeout(() => onChange(draft), 400);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);
  return <div className="w-72 max-lg:w-full">{children(draft ?? value, setDraft)}</div>;
}
