import { z } from "zod";

/**
 * A custom node pack a stage graph or a built-in batch workflow needs, with the classes it
 * provides. `ref` pins the commit Blombo installs into a managed slot
 * (services/comfy/nodepacks.ts); `folder` is its name in custom_nodes/ (the repository's name
 * when left out, as ComfyUI-Manager names it). Packs Blombo's own packages pin install by URL;
 * any other only as a pack the user confirmed for a workflow (ADR-0018). A pack with `pip` lines
 * is only Python packages (SageAttention): nothing is downloaded into custom_nodes/.
 */
export const NodePack = z.object({
  name: z.string(),
  url: z
    .string()
    .url()
    .regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/, "A GitHub repository URL"),
  nodes: z.array(z.string()),
  ref: z
    .string()
    .regex(/^[0-9a-f]{40}$/, "A full commit hash")
    .optional(),
  folder: z
    .string()
    .regex(/^[A-Za-z0-9][\w.-]{0,99}$/)
    .optional(),
  /** Pinned requirement lines (with `--hash`) installed instead of a repository. */
  pip: z.array(z.string()).optional(),
});
export type NodePack = z.infer<typeof NodePack>;
