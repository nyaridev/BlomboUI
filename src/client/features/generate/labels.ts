/**
 * Friendly names for ComfyUI's sampler and scheduler choices. The choices themselves come from
 * the workflow (object_info), so new samplers still appear; they just show their raw name.
 */

const SAMPLERS: Record<string, [label: string, group: string]> = {
  euler: ["Euler", "Deterministic"],
  euler_cfg_pp: ["Euler CFG++", "Deterministic"],
  euler_ancestral: ["Euler a", "Ancestral"],
  euler_ancestral_cfg_pp: ["Euler a CFG++", "Ancestral"],
  heun: ["Heun", "Deterministic"],
  heunpp2: ["Heun++ 2", "Deterministic"],
  dpm_2: ["DPM2", "Deterministic"],
  dpm_2_ancestral: ["DPM2 a", "Ancestral"],
  lms: ["LMS", "Deterministic"],
  dpm_fast: ["DPM fast", "Other"],
  dpm_adaptive: ["DPM adaptive", "Other"],
  dpmpp_2s_ancestral: ["DPM++ 2S a", "Ancestral"],
  dpmpp_2s_ancestral_cfg_pp: ["DPM++ 2S a CFG++", "Ancestral"],
  dpmpp_sde: ["DPM++ SDE", "SDE"],
  dpmpp_sde_gpu: ["DPM++ SDE (GPU)", "SDE"],
  dpmpp_2m: ["DPM++ 2M", "Deterministic"],
  dpmpp_2m_cfg_pp: ["DPM++ 2M CFG++", "Deterministic"],
  dpmpp_2m_sde: ["DPM++ 2M SDE", "SDE"],
  dpmpp_2m_sde_gpu: ["DPM++ 2M SDE (GPU)", "SDE"],
  dpmpp_3m_sde: ["DPM++ 3M SDE", "SDE"],
  dpmpp_3m_sde_gpu: ["DPM++ 3M SDE (GPU)", "SDE"],
  ddpm: ["DDPM", "Other"],
  lcm: ["LCM", "Other"],
  ipndm: ["iPNDM", "Other"],
  ipndm_v: ["iPNDM v", "Other"],
  deis: ["DEIS", "Other"],
  res_multistep: ["RES multistep", "Other"],
  ddim: ["DDIM", "Other"],
  uni_pc: ["UniPC", "Other"],
  uni_pc_bh2: ["UniPC BH2", "Other"],
};

const SCHEDULERS: Record<string, string> = {
  normal: "Normal",
  karras: "Karras",
  exponential: "Exponential",
  sgm_uniform: "SGM uniform",
  simple: "Simple",
  ddim_uniform: "DDIM uniform",
  beta: "Beta",
  linear_quadratic: "Linear quadratic",
  kl_optimal: "KL optimal",
};

export function samplerLabel(name: string): string {
  return SAMPLERS[name]?.[0] ?? name;
}

export function samplerGroup(name: string): string {
  return SAMPLERS[name]?.[1] ?? "Other";
}

export function schedulerLabel(name: string): string {
  return SCHEDULERS[name] ?? name;
}

/** "sd15/dreamshaper_8.safetensors" → "dreamshaper_8". */
export function modelDisplayName(file: string): string {
  return (file.split(/[\\/]/).pop() ?? file).replace(
    /\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i,
    "",
  );
}

/** The folder part of a model path, if any ("sd15/x.safetensors" → "sd15"). */
export function modelFolder(file: string): string | null {
  const parts = file.split(/[\\/]/);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : null;
}
