/**
 * The model files a compiled graph uses, matched to the local models they are, for the image's
 * `blombo` chunk (`BlomboImageMeta.models`): each with its kind, ComfyUI name, strength (LoRAs),
 * SHA256 and Civitai ids when known, so the image still says which models made it after a file
 * is renamed or moved to another PC. Any input whose value is a model file counts, plus LoRA
 * stack entries; a name no local model has is still listed (without a hash). Pure.
 */
import type { ModelKind } from "../../../shared/constants.ts";
import type { ModelUse } from "../../../shared/imageinfo.ts";
import { comfyNameOf, type LocalModel } from "../../../shared/models.ts";
import { type ApiPrompt, isApiLink } from "../../../shared/workflow/graph.ts";

const MODEL_FILE = /\.(safetensors|sft|ckpt|pt|pth|bin|gguf|onnx)$/i;

/** The kind an input name usually holds, for a file no local model has. */
const INPUT_KINDS: Record<string, ModelKind> = {
  ckpt_name: "checkpoints",
  unet_name: "diffusion_models",
  lora_name: "loras",
  vae_name: "vae",
  clip_name: "text_encoders",
  clip_name1: "text_encoders",
  clip_name2: "text_encoders",
  clip_name3: "text_encoders",
  control_net_name: "controlnet",
};

const key = (name: string) => name.replace(/\\/g, "/").toLowerCase();
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function modelsInGraph(prompt: ApiPrompt, local: LocalModel[]): ModelUse[] {
  const byName = new Map<string, LocalModel[]>();
  for (const m of local) {
    const k = key(comfyNameOf(m));
    byName.set(k, [...(byName.get(k) ?? []), m]);
  }
  const out: ModelUse[] = [];
  const seen = new Set<string>();
  const add = (input: string, name: string, strength: number | null) => {
    const want = INPUT_KINDS[input];
    const same = byName.get(key(name)) ?? [];
    const m = same.find((x) => x.kind === want) ?? same[0] ?? null;
    const kind = m?.kind ?? want;
    if (!kind) return;
    const id = `${kind}/${key(name)}/${strength}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      kind,
      name: m ? comfyNameOf(m) : name.replace(/\\/g, "/"),
      strength,
      sha256: m?.sha256 ?? null,
      civitai: m?.civitai ? { modelId: m.civitai.modelId, versionId: m.civitai.versionId } : null,
    });
  };
  for (const node of Object.values(prompt)) {
    const inputs = node.inputs ?? {};
    const strength = num(inputs.strength_model) ?? num(inputs.strength);
    for (const [input, value] of Object.entries(inputs)) {
      if (isApiLink(value)) continue;
      if (typeof value === "string" && MODEL_FILE.test(value)) {
        if (input === "lora_name" && strength === 0) continue;
        add(input, value, input === "lora_name" ? strength : null);
      } else if (/^lora_\d+$/i.test(input) && value && typeof value === "object") {
        // A LoRA stack's entry ({ on, lora, strength }).
        const e = value as { on?: unknown; lora?: unknown; strength?: unknown };
        if (e.on !== false && typeof e.lora === "string" && e.lora !== "None")
          add("lora_name", e.lora, num(e.strength));
      }
    }
  }
  return out;
}
