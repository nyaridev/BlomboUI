import { z } from "zod";

/**
 * A custom node pack a stage graph or a built-in batch workflow needs, with the classes it
 * provides. `ref` pins the commit Blombo installs into a managed slot
 * (services/comfy/nodepacks.ts); `folder` is its name in custom_nodes/ (the repository's name
 * when left out, as ComfyUI-Manager names it). Only packs that Blombo's own packages list can be
 * installed, never a URL from a request or an imported workflow.
 */
export const NodePack = z.object({
  name: z.string(),
  url: z
    .string()
    .url()
    .regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/, "A GitHub repository URL"),
  nodes: z.array(z.string()).min(1),
  ref: z
    .string()
    .regex(/^[0-9a-f]{40}$/, "A full commit hash")
    .optional(),
  folder: z
    .string()
    .regex(/^[A-Za-z0-9][\w.-]{0,99}$/)
    .optional(),
});
export type NodePack = z.infer<typeof NodePack>;
