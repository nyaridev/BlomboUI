/**
 * The first-run tour of the Generate screen. It starts once per profile, the first time a
 * generate workflow is on screen, and is marked done in settings (help.tourDone) when finished
 * or skipped; Help and Settings → Generate can start it again.
 */
import { useSettings, useUpdateSettings } from "@client/lib/queries";
import { Tour, type TourStep } from "@client/ui/Tour";
import { useEffect, useState } from "react";

const STEPS: TourStep[] = [
  {
    target: "[data-tour=workflow]",
    title: "Your workflows",
    text: "Pick what to run here. Drop a ComfyUI workflow (JSON, PNG or .blombo) on it to add one; its menu has Edit in ComfyUI, Duplicate and Export.",
  },
  {
    target: "[data-tour=models]",
    title: "Models in use",
    text: "The checkpoint, VAE and LoRAs of this workflow. Click a tile to pick another from your models folder; LoRA strengths are edited right here.",
  },
  {
    target: "[data-tour=prompt]",
    title: "Prompts",
    text: "Describe the image. Weights, LoRAs and wildcards are colored, autocomplete suggests tags (Ctrl+Space), and the clock recalls recent prompts and snippets.",
  },
  {
    target: "[data-tour=generate]",
    title: "Generate",
    text: "Click or press Ctrl+Enter. Clicking again while it runs adds to the queue; Loop keeps going until you stop it.",
    placement: "left",
  },
  {
    target: "[data-tour=params]",
    title: "Settings of this workflow",
    text: "Sampler, steps, size, seed and stages like Hires fix. Everything you change is saved with the workflow. Customize moves blocks and changes their style.",
    placement: "right",
  },
  {
    target: "[data-tour=stage]",
    title: "The image stage",
    text: "Live previews while it samples, progress per stage with speed, and the results. Drop any image on this screen to reuse its settings.",
    placement: "left",
  },
];

export function GenerateTour({ ready }: { ready: boolean }) {
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || !settings || settings.help.tourDone) return;
    // A moment after the screen settles, so the parts are where they'll stay.
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, [ready, settings]);

  return (
    <Tour
      steps={STEPS}
      open={open}
      onClose={() => {
        setOpen(false);
        update.mutate({ help: { tourDone: true } });
      }}
    />
  );
}
