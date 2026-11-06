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
  text_encoder: "text_encoders",
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

/**
 * Inputs any value passes straight through, followed when a chain has nothing else: a switch's
 * `on_false` branch (usually the plain path: no LoRA, no prompt rewriting; ComfyUI's templates
 * build it that way) and a preview's `source`.
 */
export const PASS_INPUTS = ["on_false", "source"];

/**
 * Inputs a latent passes through on its way back from the sampler to the node that sets its size.
 * `video_latent` is the video half of an audio + video latent (LTX).
 */
export const LATENT_PASS = ["samples", "latent", "latent_image", "video_latent"];

/** A latent split back into video and audio after sampling (LTX): its input is the sampler's. */
export const AV_SPLIT_INPUT = "av_latent";

/** Frame rate inputs of the node that makes a video. */
export const FPS_INPUTS = ["fps", "frame_rate"];

/** Nodes holding several LoRAs in one place; tags are added as lora_<n> entries. */
export const LORA_STACK_CLASSES = new Set(["Power Lora Loader (rgthree)"]);

/** What the compiler inserts when a graph has no LoRA stack of its own. */
export const LORA_LOADER = "LoraLoader";
/** Its sampler_name and scheduler choices are ComfyUI's lists (Settings → Generate hides some). */
export const KSAMPLER = "KSampler";
export const LORA_LOADER_MODEL_ONLY = "LoraLoaderModelOnly";

/** Output nodes recognized without object_info (with it, `output_node: true` decides). */
export const IMAGE_OUTPUT_CLASSES = new Set([
  "SaveImage",
  "PreviewImage",
  "Image Save",
  "SaveImageWebsocket",
]);

/**
 * Video outputs recognized without object_info. With it, an output node that takes a `video`
 * link is one too; VHS_VideoCombine takes images and saves a video.
 */
export const VIDEO_OUTPUT_CLASSES = new Set(["SaveVideo", "SaveWEBM", "VHS_VideoCombine"]);

/**
 * Keys of a node's UI output that hold text worth keeping: WD14 Tagger shows "tags", show-text
 * nodes and most captioners show "text". The batch runner writes them as sidecar .txt files.
 */
export const TEXT_OUTPUT_KEYS = ["text", "tags", "caption", "captions", "string"];

/** Image inputs recognized without object_info. */
export const IMAGE_INPUT_CLASSES = new Set(["LoadImage"]);
/** Video inputs (role video.input): ComfyUI's Load Video, without object_info. */
export const VIDEO_INPUT_CLASSES = new Set(["LoadVideo"]);

/** The small graph that previews a ControlNet map: load the image, preview the result. */
export const LOAD_IMAGE = "LoadImage";
export const PREVIEW_IMAGE = "PreviewImage";

/** Frontend nodes the converter resolves: a reroute passes its link on, a primitive holds a value. */
export const REROUTE = "Reroute";
export const PRIMITIVE_NODE = "PrimitiveNode";

/** Nodes that exist only in the ComfyUI frontend and never reach the API graph. */
export const FRONTEND_ONLY_CLASSES = new Set([
  REROUTE,
  PRIMITIVE_NODE,
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
  // 8n + 1 frames suit both Wan (4n + 1) and LTX (8n + 1).
  "latent.length": { min: 1, max: 241, step: 8, presets: [33, 49, 81, 97, 121] },
  "video.fps": { min: 1, max: 60, step: 1, presets: [16, 24, 25, 30] },
  "clip.skip": { min: -12, max: -1, step: 1, presets: [-1, -2] },
};
