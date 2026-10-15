/**
 * PREVIEW DATA for Phase 0 (style review). Every screen that uses this module is a design
 * preview, not wired to ComfyUI yet. Delete imports of this file as real services land.
 */
import type { CardKind } from "@client/ui";

export interface MockWorkflow {
  id: string;
  name: string;
  family: "SD 1.5" | "SDXL" | "Illustrious" | "NoobAI" | "Anima" | "Krea2" | "Utility" | "Imported";
  kind: "generate" | "batch";
  icon: "generate" | "upscale" | "image" | "text" | "workflow" | "layers";
  favorite?: boolean;
  preset?: boolean;
  updated: string;
}

export const MOCK_WORKFLOWS: MockWorkflow[] = [
  {
    id: "illustrious",
    name: "Illustrious",
    family: "Illustrious",
    kind: "generate",
    icon: "generate",
    favorite: true,
    preset: true,
    updated: "2h ago",
  },
  {
    id: "illustrious-portrait",
    name: "Illustrious · Portrait",
    family: "Illustrious",
    kind: "generate",
    icon: "generate",
    favorite: true,
    updated: "yesterday",
  },
  {
    id: "noobai",
    name: "NoobAI",
    family: "NoobAI",
    kind: "generate",
    icon: "generate",
    preset: true,
    updated: "3d ago",
  },
  {
    id: "sdxl",
    name: "SDXL",
    family: "SDXL",
    kind: "generate",
    icon: "generate",
    preset: true,
    updated: "1w ago",
  },
  {
    id: "sd15",
    name: "SD 1.5",
    family: "SD 1.5",
    kind: "generate",
    icon: "generate",
    preset: true,
    updated: "2w ago",
  },
  {
    id: "anima",
    name: "Anima",
    family: "Anima",
    kind: "generate",
    icon: "generate",
    preset: true,
    updated: "5d ago",
  },
  {
    id: "krea2",
    name: "Krea 2",
    family: "Krea2",
    kind: "generate",
    icon: "generate",
    preset: true,
    updated: "6d ago",
  },
  {
    id: "flux-lineart",
    name: "Flux line art (imported)",
    family: "Imported",
    kind: "generate",
    icon: "workflow",
    updated: "today",
  },
  {
    id: "rembg",
    name: "Background removal",
    family: "Utility",
    kind: "batch",
    icon: "image",
    preset: true,
    updated: "4d ago",
  },
  {
    id: "upscale",
    name: "Image upscale",
    family: "Utility",
    kind: "batch",
    icon: "upscale",
    preset: true,
    updated: "1w ago",
  },
  {
    id: "caption",
    name: "Captioning",
    family: "Utility",
    kind: "batch",
    icon: "text",
    preset: true,
    updated: "2w ago",
  },
  {
    id: "dataset",
    name: "Dataset prep",
    family: "Utility",
    kind: "batch",
    icon: "layers",
    preset: true,
    updated: "3w ago",
  },
];

export interface MockModel {
  name: string;
  kind: CardKind;
  base?: string;
  thumb?: string | null;
  favorite?: boolean;
}

export const MOCK_CHECKPOINTS: MockModel[] = [
  {
    name: "WAI Illustrious v14",
    kind: "checkpoints",
    base: "IL",
    thumb: "art:wai14",
    favorite: true,
  },
  { name: "NoobAI XL v-pred 1.0", kind: "checkpoints", base: "NoobAI", thumb: "art:noob" },
  { name: "Pony Realism v2.2", kind: "checkpoints", base: "Pony", thumb: null },
  { name: "Juggernaut XL XI", kind: "checkpoints", base: "SDXL", thumb: "art:jugg" },
  {
    name: "Hassaku XL (Illustrious)",
    kind: "checkpoints",
    base: "IL",
    thumb: null,
    favorite: true,
  },
  { name: "anima-base-fp8", kind: "diffusion_models", base: "Anima", thumb: null },
];

export const MOCK_LORAS: MockModel[] = [
  { name: "Detailer Slider XL", kind: "loras", base: "IL", thumb: "art:detail", favorite: true },
  { name: "Ghibli Background Style", kind: "loras", base: "IL", thumb: "art:ghibli" },
  { name: "pixel_art_v3", kind: "loras", base: "SDXL", thumb: null },
  { name: "Cinematic Lighting", kind: "loras", base: "IL", thumb: null },
  { name: "Watercolor wash", kind: "loras", base: "IL", thumb: "art:water" },
  { name: "hands_fix_xl", kind: "loras", base: "SDXL", thumb: null },
];

export const MOCK_OTHER: MockModel[] = [
  { name: "sdxl_vae_fp16fix", kind: "vae", base: "SDXL" },
  { name: "4x-UltraSharp", kind: "upscale_models" },
  { name: "face_yolov8m", kind: "ultralytics" },
  { name: "sam_vit_b_01ec64", kind: "sams" },
  { name: "controlnet-openpose-sdxl", kind: "controlnet", base: "SDXL" },
  { name: "qwen_3_4b", kind: "text_encoders", base: "Anima" },
  { name: "easynegative", kind: "embeddings", base: "SD1.5" },
  { name: "characters/heroes", kind: "wildcards" },
];

export const MOCK_PROMPT =
  "masterpiece, best quality, 1girl, solo, (silver hair:1.2), long hair, __outfits/fantasy__, standing in a misty forest at dawn, volumetric light, [blurry], <lora:Detailer Slider XL:0.8>, <lora:Ghibli Background Style:0.6>\nBREAK\nsoft rim light, \\(cinematic\\) depth of field";

export const MOCK_NEGATIVE =
  "lowres, (worst quality:1.4), bad anatomy, bad hands, watermark, signature, <lora:broken";

export const SAMPLERS = [
  { value: "euler_ancestral", label: "Euler a", group: "Ancestral" },
  { value: "dpmpp_2s_ancestral", label: "DPM++ 2S a", group: "Ancestral" },
  { value: "euler", label: "Euler", group: "Deterministic" },
  { value: "dpmpp_2m", label: "DPM++ 2M", group: "Deterministic" },
  { value: "dpmpp_2m_sde", label: "DPM++ 2M SDE", group: "SDE" },
  { value: "dpmpp_3m_sde", label: "DPM++ 3M SDE", group: "SDE" },
  { value: "uni_pc", label: "UniPC", group: "Other" },
] as const;

export const SCHEDULERS = [
  { value: "karras", label: "Karras" },
  { value: "normal", label: "Normal" },
  { value: "exponential", label: "Exponential" },
  { value: "sgm_uniform", label: "SGM uniform" },
  { value: "beta", label: "Beta" },
] as const;

export const MOCK_ERRORS = [
  {
    id: "e1",
    title: "Missing custom node: ImpactPack",
    detail: "ADetailer stage needs ComfyUI-Impact-Pack.",
    at: "12:41",
  },
  {
    id: "e2",
    title: "Civitai download failed (401)",
    detail: "Add your API key in Settings → Civitai.",
    at: "11:02",
  },
];

export const MOCK_STATS = {
  images: 18_342,
  thisWeek: 412,
  hours: 96.4,
  favorites: 1_208,
  topModels: [
    { name: "WAI Illustrious v14", count: 7_920 },
    { name: "NoobAI XL v-pred 1.0", count: 4_311 },
    { name: "Hassaku XL", count: 2_870 },
    { name: "Juggernaut XL XI", count: 1_120 },
  ],
  topLoras: [
    { name: "Detailer Slider XL", count: 6_402 },
    { name: "Ghibli Background Style", count: 2_118 },
    { name: "Cinematic Lighting", count: 1_506 },
    { name: "Watercolor wash", count: 734 },
  ],
  topWildcards: [
    { name: "outfits/fantasy", count: 3_210 },
    { name: "places/forest", count: 1_840 },
    { name: "characters/heroes", count: 1_102 },
  ],
  perDay: [48, 62, 31, 88, 104, 57, 22],
};
