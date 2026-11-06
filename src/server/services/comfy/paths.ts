/**
 * extra_model_paths.yaml for a managed ComfyUI. ComfyUI reads it once at startup, which is why
 * changing a profile's model folders means a restart. Each key is a ComfyUI model folder name;
 * the value lists subfolders of each model folder, one per line.
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
  ["frame_interpolation", ["frame_interpolation"]],
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

/** Folders under the models root that ComfyUI reads through extra_model_paths.yaml. */
export function comfyFolderKeys(): string[] {
  return [...new Set(FOLDERS.flatMap(([, dirs]) => dirs))];
}

/**
 * YAML text pointing every ComfyUI model folder at the profile's model folders, one section per
 * folder in order. The main one (first) is the default, so what ComfyUI saves itself lands there.
 * No folders → no file needed.
 */
export function extraModelPathsYaml(modelRoots: string[]): string | null {
  const roots = modelRoots.map((r) => r.trim()).filter(Boolean);
  if (!roots.length) return null;
  const sections: Record<string, Record<string, string | boolean>> = {};
  roots.forEach((root, i) => {
    const section: Record<string, string | boolean> = {
      // Forward slashes read the same on Windows and keep the YAML free of escapes.
      base_path: root.replace(/\\/g, "/"),
    };
    if (i === 0) section.is_default = true;
    for (const [key, dirs] of FOLDERS) section[key] = dirs.join("\n");
    sections[i === 0 ? "blombo" : `blombo_${i + 1}`] = section;
  });
  return `# Written by BlomboUI from the active profile's model folders. Changes are overwritten.\n${stringify(
    sections,
    { lineWidth: 0 },
  )}`;
}
