/**
 * Samplers and schedulers the profile hides (Settings → Generate) come out of every picker; the
 * one that's picked stays, so a workflow that uses a hidden one still shows what it runs.
 */
import { useSettings } from "@client/lib/queries";

export type ChoiceKind = "sampler" | "scheduler";

/** A filter for one kind's options (`null`: not a sampler or scheduler, nothing is hidden). */
export function useChoiceFilter(
  kind: ChoiceKind | null,
): (options: string[], current: string) => string[] {
  const g = useSettings().data?.generate;
  const list =
    kind === "sampler" ? g?.hiddenSamplers : kind === "scheduler" ? g?.hiddenSchedulers : [];
  const hidden = new Set(list ?? []);
  return (options, current) =>
    hidden.size ? options.filter((o) => o === current || !hidden.has(o)) : options;
}
