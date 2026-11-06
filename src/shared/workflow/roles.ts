/**
 * Semantic roles (ADR-0003). The analyzer tags graph inputs with these so generic features
 * (prompt editor, LoRA tags, resolution picker, seed modes, stages) work on any workflow.
 * `port.*` roles are sockets that stages attach to (ADR-0004).
 */
export const ROLES = [
  "prompt.positive",
  "prompt.negative",
  "model.checkpoint",
  "model.unet",
  "model.unet2",
  "model.vae",
  "model.clip",
  "model.clip2",
  "lora.stack",
  "sampler.seed",
  "sampler.steps",
  "sampler.cfg",
  "sampler.name",
  "sampler.scheduler",
  "sampler.denoise",
  "latent.width",
  "latent.height",
  "latent.batch",
  "latent.length",
  "video.fps",
  "clip.skip",
  "image.input",
  "video.input",
  "video.offset",
  "video.megapixels",
  "mask.input",
  "output.image",
  "output.text",
  "output.video",
  "port.MODEL",
  "port.CLIP",
  "port.VAE",
  "port.POSITIVE",
  "port.NEGATIVE",
  "port.LATENT",
  "port.IMAGE",
] as const;

export type Role = (typeof ROLES)[number];

/** Default UI labels for role bindings. */
export const ROLE_LABELS: Partial<Record<Role, string>> = {
  "prompt.positive": "Prompt",
  "prompt.negative": "Negative prompt",
  "model.checkpoint": "Checkpoint",
  "model.unet": "Diffusion model",
  "model.unet2": "Low noise model",
  "model.vae": "VAE",
  "model.clip": "Text encoder",
  "model.clip2": "Text encoder 2",
  "lora.stack": "LoRAs",
  "sampler.seed": "Seed",
  "sampler.steps": "Steps",
  "sampler.cfg": "CFG scale",
  "sampler.name": "Sampler",
  "sampler.scheduler": "Scheduler",
  "sampler.denoise": "Denoise",
  "latent.width": "Width",
  "latent.height": "Height",
  "latent.batch": "Batch size",
  "latent.length": "Frames",
  "video.fps": "Frame rate",
  "clip.skip": "CLIP skip",
  "image.input": "Input image",
  "video.input": "Input video",
  "video.offset": "Start frame",
  "video.megapixels": "Size (megapixels)",
  "mask.input": "Mask",
  "output.image": "Filename prefix",
  "output.text": "Text output",
  "output.video": "Video output",
};

/** What a workflow makes: still images, or video (it has an `output.video` node). */
export const WORKFLOW_MEDIA = ["image", "video"] as const;
export type WorkflowMedia = (typeof WORKFLOW_MEDIA)[number];

/**
 * What the first pass starts from. Images: an empty latent, an image, an image with a painted
 * mask. Video: an empty latent, a first frame, or a first and a last frame. A workflow offers the
 * ones a stage package fits (`sourceModes` on the workflow detail).
 */
export const SOURCE_MODES = [
  "txt2img",
  "img2img",
  "inpaint",
  "first",
  "firstLast",
  "extend",
] as const;
export type SourceMode = (typeof SOURCE_MODES)[number];

/**
 * `source` is the first pass's image (img2img or inpaint): it runs before every other stage and
 * lives in the First pass card (a layout feature), not in a tab of its own (TAB_STAGES).
 */
export const STAGES = ["source", "controlnet", "hires", "adetailer", "upscale", "smooth"] as const;
export type StageId = (typeof STAGES)[number];
export const TAB_STAGES = ["controlnet", "hires", "adetailer", "upscale", "smooth"] as const;
