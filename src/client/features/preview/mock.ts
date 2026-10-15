/**
 * PREVIEW DATA for screens not wired yet (Models view, Settings stats, the Design Lab's sample
 * prompt). Generate and the header run on real data. Delete imports of this file as the
 * remaining services land.
 */
import type { CardKind } from "@client/ui";

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
