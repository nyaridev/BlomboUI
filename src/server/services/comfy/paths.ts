/**
 * extra_model_paths.yaml for a managed ComfyUI. ComfyUI reads it once at startup, which is why
 * changing a profile's models folder means a restart. Each key is a ComfyUI model folder name;
 * the value lists subfolders of the profile's models root, one per line.
 */
import { stringify } from "yaml";

/** ComfyUI folder key → subfolders of the models root it should search. */
const FOLDERS: Array<[string, string[]]> = [
  ["checkpoints", ["checkpoints"]],
  ["diffusion_models", ["diffusion_models", "unet"]],
  ["text_encoders", ["text_encoders", "clip"]],
  ["clip_vision", ["clip_vision"]],
  ["vae", ["vae"]],
  ["vae_approx", ["vae_approx"]],
  ["loras", ["loras"]],
  ["embeddings", ["embeddings"]],
  ["upscale_models", ["upscale_models"]],
  ["latent_upscale_models", ["latent_upscale_models"]],
  ["controlnet", ["controlnet", "t2i_adapter"]],
  ["style_models", ["style_models"]],
  ["hypernetworks", ["hypernetworks"]],
  ["gligen", ["gligen"]],
  ["photomaker", ["photomaker"]],
  ["model_patches", ["model_patches"]],
  ["audio_encoders", ["audio_encoders"]],
  ["sams", ["sams"]],
  ["ultralytics", ["ultralytics"]],
  ["ultralytics_bbox", ["ultralytics/bbox"]],
  ["ultralytics_segm", ["ultralytics/segm"]],
];

/** YAML text pointing every ComfyUI model folder at `modelsRoot`. Empty root → no file needed. */
export function extraModelPathsYaml(modelsRoot: string): string | null {
  const root = modelsRoot.trim();
  if (!root) return null;
  const section: Record<string, string | boolean> = {
    // Forward slashes read the same on Windows and keep the YAML free of escapes.
    base_path: root.replace(/\\/g, "/"),
    is_default: true,
  };
  for (const [key, dirs] of FOLDERS) section[key] = dirs.join("\n");
  return `# Written by BlomboUI from the active profile's models folder. Changes are overwritten.\n${stringify(
    { blombo: section },
    { lineWidth: 0 },
  )}`;
}
