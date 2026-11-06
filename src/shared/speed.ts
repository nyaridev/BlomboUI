/**
 * How Blombo starts a ComfyUI it runs (a managed slot or your own folder): which attention it
 * uses and whether Comfy Kitchen's Triton kernels are on (ComfyUI's launch flags). Saved on the
 * profile (`profile.launch`); changing it restarts that ComfyUI. SageAttention isn't part of a
 * slot, so it's a pip-only pack the custom node installer can add (`SAGE_PACK`, pinned wheels).
 */
import { z } from "zod";
import type { NodePack } from "./workflow/packs.ts";

export const ATTENTIONS = ["default", "kitchen", "sage", "flash"] as const;
export type Attention = (typeof ATTENTIONS)[number];

export const ATTENTION_LABELS: Record<Attention, string> = {
  default: "PyTorch (default)",
  kitchen: "Comfy Kitchen",
  sage: "SageAttention",
  flash: "FlashAttention",
};

/** The Python module each one needs in the slot (PyTorch's is always there). */
export const ATTENTION_MODULES: Record<Attention, string | null> = {
  default: null,
  kitchen: "comfy_kitchen",
  sage: "sageattention",
  flash: "flash_attn",
};

export const ComfyLaunch = z.object({
  attention: z.enum(ATTENTIONS).default("default"),
  /** Comfy Kitchen's Triton kernels (`--enable-triton-backend`); needs triton in the slot. */
  triton: z.boolean().default(false),
});
export type ComfyLaunch = z.infer<typeof ComfyLaunch>;

/** ComfyUI's flags for these choices. */
export function launchArgs(launch: ComfyLaunch): string[] {
  const flag: Record<Attention, string | null> = {
    default: null,
    kitchen: "--use-ck-attention",
    sage: "--use-sage-attention",
    flash: "--use-flash-attention",
  };
  const attention = flag[launch.attention];
  return [...(attention ? [attention] : []), ...(launch.triton ? ["--enable-triton-backend"] : [])];
}

/** Which of the modules above (and triton) the slot's Python can import (`GET /api/comfy/speed`). */
export const SpeedInfo = z.object({
  /** False for a ComfyUI Blombo doesn't start (an address): nothing here applies. */
  managed: z.boolean(),
  modules: z.record(z.string(), z.boolean()),
});
export type SpeedInfo = z.infer<typeof SpeedInfo>;

/**
 * SageAttention for Windows (woct0rdho's builds) with the Triton it needs, pinned by hash: CUDA
 * 12.8, PyTorch 2.10 and newer, any Python 3.10+ (abi3); triton-windows 3.7 goes with PyTorch
 * 2.11. `ref` is the release tag's commit.
 * shortcut: Windows + CUDA 12.8 only; add other wheels when a slot uses another PyTorch build.
 */
export const SAGE_PACK: NodePack = {
  name: "SageAttention",
  url: "https://github.com/woct0rdho/SageAttention",
  ref: "93128b972683e52cd382c6731c1f09505e7524b5",
  nodes: [],
  pip: [
    "sageattention @ https://github.com/woct0rdho/SageAttention/releases/download/v2.2.0-windows.post6/sageattention-2.2.0%2Bcu128torch2.10.0andhigher.post6-cp310-abi3-win_amd64.whl --hash=sha256:103e06df49486daa87c3338bf2490ada2b074da1422f2b90566a8f2f81a6b76e",
    "triton-windows==3.7.1.post27 --hash=sha256:01ede775b102c91acc89fc6946b946451f966cb64856c650d244d37ea3bbdee5 --hash=sha256:b739bd7d39f919280294d8af172a90aa2f17a4377bfbca2ea30a8afae61d5eaa --hash=sha256:f5406230d7dbf6965bc4051fcad27b81c39ba4a4bfde06f494dd7ff4eb325a9e --hash=sha256:e8ed215c02afc85a81f0097196f8bebdf6f68085f1bc0fe8771b9a74783f15ab --hash=sha256:b4b581bc56ea75321c404f0ef9f08aff0369cd05c4e5811a57c86bfe4e532938",
  ],
};
