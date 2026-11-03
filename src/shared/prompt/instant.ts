/**
 * Instant LoRAs: LoRAs picked without a <lora:…> tag in the prompt. A workflow keeps them in its
 * values under INSTANT_LORAS; at run time each one joins the LoRA stack and its trigger words go
 * at the start or the end of the positive prompt (per LoRA, in its model info). Picking a LoRA
 * adds it this way unless its model info turns Instant off, which puts a tag in the prompt.
 */
import { z } from "zod";

/** The values key a workflow keeps its instant LoRAs under (never a binding id: no role has it). */
export const INSTANT_LORAS = "loras.instant";

export const TRIGGER_AT = ["start", "end"] as const;
export type TriggerAt = (typeof TRIGGER_AT)[number];

export const InstantLora = z.object({
  /** The LoRA as a tag names it: its path in the loras folder without the extension. */
  name: z.string().trim().min(1),
  strength: z.number().finite(),
});
export type InstantLora = z.infer<typeof InstantLora>;

/** Saved instant LoRAs, keeping every valid entry (the values are hand-editable). */
export function readInstantLoras(value: unknown): InstantLora[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const r = InstantLora.safeParse(v);
    return r.success ? [r.data] : [];
  });
}

/** The prompt with trigger words joined in front and behind, comma-separated. */
export function withTriggers(text: string, start: string[], end: string[]): string {
  const join = (parts: string[]) =>
    parts
      .map((p) =>
        p
          .trim()
          .replace(/^,+|,+$/g, "")
          .trim(),
      )
      .filter(Boolean)
      .join(", ");
  return join([join(start), text, join(end)]);
}
