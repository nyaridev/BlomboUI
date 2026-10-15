/**
 * safetensors headers: 8 bytes of little-endian length, then that much JSON describing every
 * tensor plus an optional `__metadata__` map of strings. Trainers (kohya's `ss_*` keys,
 * `modelspec.*`) put the base model, network settings and the training tags there.
 *
 * Reading only the header keeps this cheap for multi-GB files: the server reads it from disk,
 * the browser slices it from a dropped File, and both parse it here.
 */
import { z } from "zod";

/** Headers bigger than this aren't real safetensors files (the spec caps them at 100 MB). */
export const MAX_HEADER_BYTES = 100 * 1024 * 1024;

export function headerLength(first8: Uint8Array): number | null {
  if (first8.byteLength < 8) return null;
  const view = new DataView(first8.buffer, first8.byteOffset, 8);
  const n = Number(view.getBigUint64(0, true));
  return n > 1 && n <= MAX_HEADER_BYTES ? n : null;
}

export const TagCount = z.tuple([z.string(), z.number()]);

export const SafetensorsInfo = z.object({
  tensors: z.number().int(),
  /** Parameter count (sum of tensor sizes). */
  parameters: z.number(),
  /** dtype → number of tensors. */
  dtypes: z.record(z.string(), z.number()),
  /** What the tensor names suggest. */
  guess: z.enum(["lora", "checkpoint", "diffusion", "vae", "text-encoder", "embedding", "other"]),
  metadata: z.record(z.string(), z.string()),
  /** The training details people look for, already decoded. */
  training: z.object({
    title: z.string().nullable(),
    baseModel: z.string().nullable(),
    architecture: z.string().nullable(),
    network: z.string().nullable(),
    dim: z.string().nullable(),
    alpha: z.string().nullable(),
    epochs: z.string().nullable(),
    steps: z.string().nullable(),
    resolution: z.string().nullable(),
    learningRate: z.string().nullable(),
    optimizer: z.string().nullable(),
    images: z.string().nullable(),
    triggerWords: z.array(z.string()),
    /** Training tags across all dataset folders, most used first. */
    tags: z.array(TagCount),
    datasets: z.array(z.object({ name: z.string(), images: z.number(), repeats: z.number() })),
  }),
});
export type SafetensorsInfo = z.infer<typeof SafetensorsInfo>;

function parseMaybe(text: string | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function guessKind(names: string[]): SafetensorsInfo["guess"] {
  const has = (re: RegExp) => names.some((n) => re.test(n));
  if (has(/lora_(up|down)|\.lora_[AB]\.|lora\.(up|down)|\.alpha$/)) return "lora";
  if (has(/^(emb_params|string_to_param|clip_[lg])$/) && names.length <= 4) return "embedding";
  if (has(/^model\.diffusion_model\./)) return "checkpoint";
  if (has(/^(double_blocks|single_blocks|joint_blocks|transformer_blocks|input_blocks)\./))
    return "diffusion";
  if (has(/^(encoder|decoder)\.(conv_in|mid)/)) return "vae";
  if (has(/^(text_model|encoder\.block|model\.layers)\./)) return "text-encoder";
  return "other";
}

/** Parse header JSON (the bytes after the 8-byte length). */
export function parseSafetensorsHeader(json: string): SafetensorsInfo {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const meta: Record<string, string> = {};
  const metaRaw = raw.__metadata__;
  if (metaRaw && typeof metaRaw === "object")
    for (const [k, v] of Object.entries(metaRaw as Record<string, unknown>))
      meta[k] = typeof v === "string" ? v : JSON.stringify(v);

  const dtypes: Record<string, number> = {};
  let parameters = 0;
  const names: string[] = [];
  for (const [name, t] of Object.entries(raw)) {
    if (name === "__metadata__" || !t || typeof t !== "object") continue;
    names.push(name);
    const tensor = t as { dtype?: unknown; shape?: unknown };
    const dtype = typeof tensor.dtype === "string" ? tensor.dtype : "?";
    dtypes[dtype] = (dtypes[dtype] ?? 0) + 1;
    if (Array.isArray(tensor.shape))
      parameters += tensor.shape.reduce<number>((n, d) => n * (Number(d) || 0), 1);
  }

  const get = (...keys: string[]) => {
    for (const k of keys) if (meta[k]?.trim()) return meta[k].trim();
    return null;
  };

  const tagTotals = new Map<string, number>();
  const freq = parseMaybe(meta.ss_tag_frequency);
  if (freq && typeof freq === "object")
    for (const folder of Object.values(freq as Record<string, unknown>))
      if (folder && typeof folder === "object")
        for (const [tag, n] of Object.entries(folder as Record<string, unknown>)) {
          const clean = tag.trim();
          if (clean) tagTotals.set(clean, (tagTotals.get(clean) ?? 0) + (Number(n) || 0));
        }

  const datasets: SafetensorsInfo["training"]["datasets"] = [];
  const dirs = parseMaybe(meta.ss_dataset_dirs);
  if (dirs && typeof dirs === "object")
    for (const [name, d] of Object.entries(dirs as Record<string, unknown>)) {
      const entry = (d ?? {}) as { img_count?: unknown; n_repeats?: unknown };
      datasets.push({
        name,
        images: Number(entry.img_count) || 0,
        repeats: Number(entry.n_repeats) || 0,
      });
    }

  const trigger = get("modelspec.trigger_phrase", "ss_trigger_words", "trigger_words");
  return {
    tensors: names.length,
    parameters,
    dtypes,
    guess: guessKind(names),
    metadata: meta,
    training: {
      title: get("modelspec.title", "ss_output_name", "name"),
      baseModel: get("ss_base_model_version", "modelspec.architecture", "ss_sd_model_name"),
      architecture: get("modelspec.architecture"),
      network: get("ss_network_module"),
      dim: get("ss_network_dim"),
      alpha: get("ss_network_alpha"),
      epochs: get("ss_epoch", "ss_num_epochs"),
      steps: get("ss_steps", "ss_max_train_steps"),
      resolution: get("ss_resolution", "modelspec.resolution"),
      learningRate: get("ss_learning_rate", "ss_unet_lr"),
      optimizer: get("ss_optimizer"),
      images: get("ss_num_train_images"),
      triggerWords: trigger
        ? trigger
            .split(/[,\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      tags: [...tagTotals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      datasets,
    },
  };
}
