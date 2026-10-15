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

export const STAGES = ["controlnet", "hires", "adetailer", "upscale"] as const;
export type StageId = (typeof STAGES)[number];
