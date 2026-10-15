/**
 * Everything Blombo knows about specific ComfyUI node classes and input names lives here, so
 * the rest of the app works from bindings and roles (AGENTS.md: never branch on class types).
 * Most detection is by input *names* (seed, steps, positive, ckpt_name…), which also covers the
 * many custom nodes that copy core naming. Class names appear only where nothing else works.
 */
import type { ModelKind } from "../../../shared/constants.ts";

/** Widget input name → the model folder its choices come from. */
export const MODEL_INPUTS: Record<string, ModelKind> = {
  ckpt_name: "checkpoints",
  unet_name: "diffusion_models",
  vae_name: "vae",
  lora_name: "loras",
  clip_name: "text_encoders",
  clip_name1: "text_encoders",
  clip_name2: "text_encoders",
  clip_name3: "text_encoders",
  control_net_name: "controlnet",
  model_name: "upscale_models",
  embedding_name: "embeddings",
};

/** Inputs that hold a seed. */
export const SEED_INPUTS = ["seed", "noise_seed"];

/** Text inputs of prompt encoders, in preference order (CLIPTextEncodeSDXL has text_g/text_l). */
export const TEXT_INPUTS = ["text", "text_g", "prompt", "positive", "string", "value"];

/** Inputs that pass conditioning through modifier nodes (ControlNet apply, combine, area…). */
export const CONDITIONING_PASS = ["conditioning", "conditioning_to", "conditioning_1", "cond"];

/** Nodes holding several LoRAs in one place; tags are added as lora_<n> entries. */
export const LORA_STACK_CLASSES = new Set(["Power Lora Loader (rgthree)"]);

/** What the compiler inserts when a graph has no LoRA stack of its own. */
export const LORA_LOADER = "LoraLoader";
export const LORA_LOADER_MODEL_ONLY = "LoraLoaderModelOnly";

/** Output nodes recognized without object_info (with it, `output_node: true` decides). */
export const IMAGE_OUTPUT_CLASSES = new Set([
  "SaveImage",
  "PreviewImage",
  "Image Save",
  "SaveImageWebsocket",
]);

/** Image inputs recognized without object_info. */
export const IMAGE_INPUT_CLASSES = new Set(["LoadImage"]);

/** Nodes that exist only in the ComfyUI frontend and never reach the API graph. */
export const FRONTEND_ONLY_CLASSES = new Set([
  "Reroute",
  "PrimitiveNode",
  "Note",
  "MarkdownNote",
  "Label (rgthree)",
  "Fast Groups Bypasser (rgthree)",
  "Fast Groups Muter (rgthree)",
  "Bookmark (rgthree)",
]);

/** Widgets that add an extra entry to widgets_values right after themselves in UI graphs. */
export const UPLOAD_WIDGET_FLAGS = [
  "image_upload",
  "video_upload",
  "audio_upload",
  "animated_image_upload",
];

/**
 * Comfortable UI ranges for role bindings. ComfyUI's own limits are far wider (steps up to
 * 10 000), which would make sliders useless; values outside stay valid and still run.
 */
export const ROLE_RANGES: Record<
  string,
  { min: number; max: number; step: number; presets?: number[] }
> = {
  "sampler.steps": { min: 1, max: 150, step: 1, presets: [20, 25, 30, 40] },
  "sampler.cfg": { min: 1, max: 20, step: 0.5, presets: [4, 5, 6, 7] },
  "sampler.denoise": { min: 0, max: 1, step: 0.01, presets: [0.3, 0.5, 0.75, 1] },
  "latent.width": { min: 64, max: 4096, step: 8 },
  "latent.height": { min: 64, max: 4096, step: 8 },
  "latent.batch": { min: 1, max: 16, step: 1, presets: [1, 2, 4] },
  "clip.skip": { min: -12, max: -1, step: 1, presets: [-1, -2] },
};
