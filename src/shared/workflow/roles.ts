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
  "clip.skip",
  "image.input",
  "mask.input",
  "output.image",
  "output.text",
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
  "clip.skip": "CLIP skip",
  "image.input": "Input image",
  "mask.input": "Mask",
  "output.image": "Filename prefix",
  "output.text": "Text output",
};

export const STAGES = ["controlnet", "hires", "adetailer", "upscale"] as const;
export type StageId = (typeof STAGES)[number];
