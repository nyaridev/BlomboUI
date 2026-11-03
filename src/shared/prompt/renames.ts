/**
 * What a rename in the Generate pickers changes in text: `<lora:name:…>` tags and `__wildcard__`
 * references, only when the whole name matches (or, for a folder, its whole folder part). Used
 * on the profile's wildcard files (server) and the open workflow's prompts (client).
 */
import { z } from "zod";

export const RenameChange = z.object({
  kind: z.enum(["lora", "wildcard"]),
  /** Before and after: "style/Detailer" (no extension needed) or, for a folder, "style". */
  from: z.string().min(1).max(400),
  to: z.string().min(1).max(400),
  folder: z.boolean().default(false),
});
export type RenameChange = z.infer<typeof RenameChange>;
export const RenameRefsBody = z.object({ changes: z.array(RenameChange).min(1).max(20) });

const EXT = /\.(safetensors|ckpt|pt|pth|bin|sft|gguf)$/i;
const plain = (s: string) => s.replace(/\\/g, "/").replace(EXT, "");
const base = (s: string) => s.slice(s.lastIndexOf("/") + 1);

/**
 * A name after the rename, or null when it isn't the renamed file or inside the renamed
 * folder. Keeps the name's own extension and slash style. With `byFileName` (LoRA tags), a name
 * written as the file name alone ("Detailer") follows a file rename too.
 */
export function renameName(
  name: string,
  c: Pick<RenameChange, "from" | "to" | "folder">,
  byFileName = false,
): string | null {
  const slash = name.includes("\\") ? "\\" : "/";
  const ext = name.match(EXT)?.[0] ?? "";
  const n = plain(name);
  const from = plain(c.from);
  const to = plain(c.to);
  let out: string | null = null;
  if (c.folder) {
    if (n.toLowerCase().startsWith(`${from.toLowerCase()}/`)) out = to + n.slice(from.length);
  } else if (n.toLowerCase() === from.toLowerCase()) out = to;
  else if (byFileName && !n.includes("/") && n.toLowerCase() === base(from).toLowerCase())
    out = base(to);
  return out === null ? null : out.replaceAll("/", slash) + ext;
}

const LORA_TAG = /<lora:([^:>]+)((?::[^>]*)?)>/gi;
const WILDCARD = /__([A-Za-z0-9][^\s{}|]*?)__/g;

/** The text with every full reference to the renamed LoRA or wildcard (or folder) updated. */
export function renameRefs(text: string, c: RenameChange): string {
  if (c.kind === "lora")
    return text.replace(LORA_TAG, (tag, name: string, rest: string) => {
      const next = renameName(name, c, true);
      return next === null ? tag : `<lora:${next}${rest}>`;
    });
  return text.replace(WILDCARD, (ref, name: string) => {
    const next = renameName(name, c);
    return next === null ? ref : `__${next}__`;
  });
}
