/**
 * Installing a managed ComfyUI slot from inside the app (the owner's choice over console
 * prompts). The server runs the steps and reports this state on the live bus; the UI only
 * shows it. A slot ends up as runtime/comfyui/<slot>/ with ComfyUI/ and its own .venv.
 */
import { z } from "zod";

export const INSTALL_STEPS = [
  "tools",
  "python",
  "comfyui",
  "torch",
  "requirements",
  "verify",
] as const;
export type InstallStepId = (typeof INSTALL_STEPS)[number];

export const INSTALL_STEP_LABELS: Record<InstallStepId, string> = {
  tools: "Download the installer tool (uv)",
  python: "Set up Python",
  comfyui: "Download ComfyUI",
  torch: "Install PyTorch",
  requirements: "Install ComfyUI's packages",
  verify: "Check the install",
};

/** PyTorch builds: NVIDIA GPUs (CUDA 12.8) or CPU only (slow, for machines without one). */
export const TORCH_VARIANTS = ["cuda", "cpu"] as const;
export type TorchVariant = (typeof TORCH_VARIANTS)[number];

export const SlotName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, "Invalid slot name");

export const InstallBody = z.object({
  slot: SlotName.default("latest"),
  torch: z.enum(TORCH_VARIANTS).default("cuda"),
  /** A ComfyUI release tag ("v0.3.60") or "latest". */
  version: z.string().trim().max(40).default("latest"),
});
export type InstallBody = z.input<typeof InstallBody>;

export const InstallStep = z.object({
  id: z.enum(INSTALL_STEPS),
  state: z.enum(["pending", "active", "done", "error", "skipped"]),
  /** 0–1 when the step knows how far it is (downloads), else null. */
  progress: z.number().nullable(),
  detail: z.string().nullable(),
});
export type InstallStep = z.infer<typeof InstallStep>;

export const InstallState = z.object({
  state: z.enum(["idle", "running", "done", "error", "cancelled"]),
  slot: z.string().nullable(),
  torch: z.enum(TORCH_VARIANTS).nullable(),
  /** The ComfyUI release being installed, once known. */
  version: z.string().nullable(),
  steps: z.array(InstallStep),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  /** What went wrong and what to do next. */
  error: z.string().nullable(),
  /** The last lines the tools printed. */
  log: z.array(z.string()),
});
export type InstallState = z.infer<typeof InstallState>;

export function idleInstall(): InstallState {
  return {
    state: "idle",
    slot: null,
    torch: null,
    version: null,
    steps: INSTALL_STEPS.map((id) => ({ id, state: "pending", progress: null, detail: null })),
    startedAt: null,
    finishedAt: null,
    error: null,
    log: [],
  };
}

export const SlotsResponse = z.object({
  slots: z.array(z.string()),
  install: InstallState,
});
export type SlotsResponse = z.infer<typeof SlotsResponse>;

/* ── custom node packs ───────────────────────────────────────────────────────
 * Installing the custom node packs a stage needs into the profile's managed slot
 * (services/comfy/nodepacks.ts). Packs are named by repository URL and must be one a stage
 * package lists with a pinned commit; the server never installs a URL from the page.
 */

export const NodeInstallBody = z.object({
  packs: z.array(z.string().url()).min(1).max(10),
});
export type NodeInstallBody = z.infer<typeof NodeInstallBody>;

export const NodeInstallStep = z.object({
  /** "download:<folder>", "packages:<folder>", "restart" or "verify". */
  id: z.string(),
  label: z.string(),
  state: z.enum(["pending", "active", "done", "error", "skipped"]),
  progress: z.number().nullable(),
  detail: z.string().nullable(),
});
export type NodeInstallStep = z.infer<typeof NodeInstallStep>;

export const NodeInstallState = z.object({
  state: z.enum(["idle", "running", "done", "error", "cancelled"]),
  slot: z.string().nullable(),
  /** Repository URLs of the packs in this install. */
  packs: z.array(z.string()),
  steps: z.array(NodeInstallStep),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  /** What went wrong and what to do next. */
  error: z.string().nullable(),
  /** Said when it's done ("ComfyUI loads them the next time it starts"). */
  note: z.string().nullable(),
  log: z.array(z.string()),
});
export type NodeInstallState = z.infer<typeof NodeInstallState>;

export function idleNodeInstall(): NodeInstallState {
  return {
    state: "idle",
    slot: null,
    packs: [],
    steps: [],
    startedAt: null,
    finishedAt: null,
    error: null,
    note: null,
    log: [],
  };
}

/** What Blombo keeps about the packs it put in a slot: <slot>/blombo/packs.json. */
export const InstalledPacks = z.record(
  z.string(),
  z.object({ url: z.string(), ref: z.string(), installedAt: z.string() }),
);
export type InstalledPacks = z.infer<typeof InstalledPacks>;
