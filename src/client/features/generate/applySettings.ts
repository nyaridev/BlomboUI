/**
 * "Use these settings" from an image (gallery lightbox, File Info).
 *
 *  - An image Blombo made, whose workflow still exists: switch to that workflow and load the
 *    values it ran with, with the image's seed fixed so the next click reproduces it.
 *  - Anything else: put the values it carries by role (prompt, steps, CFG, sampler, size, seed,
 *    model…) into the active workflow's matching parameters. Choices the workflow can't take
 *    (a checkpoint you don't have) are skipped and named.
 *
 * Values go through `setValue`, so they save into the workflow like any edit.
 */
import { api } from "@client/lib/api";
import { qk, queryClient } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { toast } from "@client/ui";
import type { ImageSettings } from "@shared/imageinfo";
import type { Binding, WorkflowManifest } from "@shared/workflow/manifest";
import { useValues } from "./state";
import { pickWorkflow, useActiveChoice } from "./workflow";

const stem = (s: string) =>
  s
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, "")
    .toLowerCase() ?? "";

/** The value as this binding can take it, or undefined when it can't. Exported for tests. */
export function fitValue(b: Binding, value: unknown): unknown {
  switch (b.type) {
    case "prompt":
    case "string":
      return typeof value === "string" ? value : undefined;
    case "int":
    case "seed": {
      const n = Math.round(Number(value));
      return Number.isFinite(n) ? n : undefined;
    }
    case "float": {
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    }
    case "bool":
      return typeof value === "boolean" ? value : undefined;
    case "enum":
      return typeof value === "string" && (!b.options || b.options.includes(value))
        ? value
        : undefined;
    case "model": {
      if (typeof value !== "string") return undefined;
      if (!b.options) return value;
      if (b.options.includes(value)) return value;
      // Same model in another subfolder or with another extension.
      return b.options.find((o) => stem(o) === stem(value));
    }
    default:
      return undefined;
  }
}

async function manifest(profileId: string, id: string): Promise<WorkflowManifest> {
  return queryClient.fetchQuery({
    queryKey: qk.workflow(profileId, id),
    queryFn: () => api.workflow(id),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Apply an image's settings to Generate. Resolves with true when anything was applied. */
export async function applyImageSettings(
  settings: ImageSettings,
  seed: number | null,
): Promise<boolean> {
  const profileId = useSession.getState().profileId;
  if (!profileId) return false;
  try {
    const list = await queryClient.fetchQuery({
      queryKey: qk.workflows(profileId),
      queryFn: api.workflows,
    });
    const own = settings.workflowId && list.some((w) => w.id === settings.workflowId);
    const targetId = own
      ? (settings.workflowId as string)
      : pickWorkflow(list, useActiveChoice.getState().byProfile[profileId]);
    if (!targetId) {
      toast("Add a workflow first: open Generate and install a preset.", "warning");
      return false;
    }
    const m = await manifest(profileId, targetId);
    useActiveChoice.getState().choose(profileId, m.id);
    useValues.getState().load(m);

    const applied: string[] = [];
    const skipped: string[] = [];
    const put = (b: Binding, raw: unknown) => {
      const v = fitValue(b, raw);
      if (v === undefined) {
        skipped.push(`${b.label}${typeof raw === "string" ? ` "${stem(raw)}"` : ""}`);
        return;
      }
      useValues.getState().setValue(b.id, v);
      applied.push(b.label);
    };

    // The workflow's own values (prompts as typed, wildcards and all) win; anything they don't
    // cover comes from what the graph actually ran with, by role.
    const values = own ? (settings.values ?? {}) : {};
    for (const b of m.bindings) {
      if (b.type === "loras") continue;
      if (b.id in values) put(b, values[b.id]);
      else if (b.role && b.role in settings.roles) put(b, settings.roles[b.role]);
    }
    const seedBinding = m.bindings.find((b) => b.role === "sampler.seed");
    if (seedBinding && seed !== null) {
      useValues.getState().setValue(seedBinding.id, seed);
      useValues.getState().setRun({ seedMode: "fixed" });
    }

    if (!applied.length) {
      toast(`"${m.name}" has no settings this image can fill.`, "warning");
      return false;
    }
    const where = own ? `"${m.name}" (the workflow that made it)` : `"${m.name}"`;
    const seedNote = seedBinding && seed !== null ? ` Seed fixed to ${seed}.` : "";
    if (skipped.length)
      toast(
        `Applied ${applied.length} settings to ${where}.${seedNote} Skipped ${skipped.slice(0, 2).join(", ")}${skipped.length > 2 ? "…" : ""}: not available here.`,
        "warning",
      );
    else toast(`Applied ${applied.length} settings to ${where}.${seedNote}`, "success");
    return true;
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), "error");
    return false;
  }
}
