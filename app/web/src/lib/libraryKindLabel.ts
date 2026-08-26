const LABELS: Record<string, string> = {
  checkpoints: 'Checkpoint',
  diffusion_models: 'Diffusion',
  loras: 'LoRA',
  vae: 'VAE',
  text_encoders: 'Text encoder',
  controlnet: 'ControlNet',
  embeddings: 'Embeddings',
  wildcards: 'Wildcards',
}

export function libraryKindLabel(kind: string) {
  return LABELS[kind] || kind
}
