/**
 * Re-sync after a graph comes back from ComfyUI (ADR-0003, ADR-0009). The analyzer reads the
 * new graph from scratch; this module carries the user's values over to it and says what
 * changed. A new binding takes the value of the old binding it matches (unless the value was
 * changed in ComfyUI: then the graph's new value wins), matching tried in order:
 *
 *   1. the same (node id, input), when that node id still holds the same class
 *   2. the same (class_type, title, input), when exactly one node has that class and title
 *   3. the same role (the prompt moved to a new text encoder, the seed to a new sampler)
 *
 * Old parameters that aren't on the new graph anymore are reported as removed, and their values
 * stay in `values` under their old ids, so nothing the user typed is lost if the node comes
 * back. Bindings the user exposed by hand (no role, not from a `$` title) follow their node when
 * it still has that input.
 */
import type { ResyncReport } from "../../../shared/bridge.ts";
import { type ApiPrompt, isApiLink, type ObjectInfo } from "../../../shared/workflow/graph.ts";
import type { Binding, Finding, WorkflowManifest } from "../../../shared/workflow/manifest.ts";
import { analyze } from "./analyze.ts";

export interface ResyncResult {
  bindings: Binding[];
  values: Record<string, unknown>;
  kind: WorkflowManifest["kind"];
  report: ResyncReport;
  findings: Finding[];
}

const titleOf = (p: ApiPrompt, id: string) => p[id]?._meta?.title?.trim() ?? "";

function sameClassAndTitle(prompt: ApiPrompt, cls: string, title: string): string[] {
  return Object.keys(prompt).filter(
    (id) => prompt[id]?.class_type === cls && titleOf(prompt, id) === title,
  );
}

/** Where an old (node, input) lives in the new graph, or null. */
function locate(
  oldPrompt: ApiPrompt,
  newPrompt: ApiPrompt,
  node: string,
  input: string,
): string | null {
  const before = oldPrompt[node];
  if (!before) return null;
  const now = newPrompt[node];
  if (now && now.class_type === before.class_type && input in now.inputs) return node;
  const twins = sameClassAndTitle(newPrompt, before.class_type, titleOf(oldPrompt, node));
  const only = twins.length === 1 ? twins[0] : undefined;
  return only !== undefined && input in (newPrompt[only]?.inputs ?? {}) ? only : null;
}

export function resync(
  old: Pick<WorkflowManifest, "bindings" | "values" | "kind">,
  oldPrompt: ApiPrompt,
  newPrompt: ApiPrompt,
  info: ObjectInfo | null,
): ResyncResult {
  const analysis = analyze(newPrompt, info);
  const bindings = analysis.bindings.map((b) => ({ ...b }));
  const values: Record<string, unknown> = { ...analysis.values };
  const matched = new Set<Binding>();
  const at = (node: string, input: string) =>
    bindings.find((b) => b.node === node && b.input === input);

  const changed: string[] = [];
  const carry = (from: Binding, to: Binding, samePlace: boolean) => {
    matched.add(from);
    // The canvas was opened with the workflow's values in it (bridge.ts), so an input that
    // comes back with something else was changed in ComfyUI: that new value is what the user
    // wants. A match by role is another node, so there is nothing to compare.
    const shown =
      from.id in old.values ? old.values[from.id] : oldPrompt[from.node]?.inputs[from.input];
    const after = newPrompt[to.node]?.inputs[to.input];
    const edited =
      samePlace &&
      after !== undefined &&
      !isApiLink(after) &&
      from.type !== "loras" &&
      JSON.stringify(shown) !== JSON.stringify(after);
    if (edited) {
      values[to.id] = after;
      if (from.id in old.values) changed.push(to.label);
    } else if (from.id in old.values) values[to.id] = old.values[from.id];
    // A label or visibility the user may have set for this parameter survives.
    if (!from.role) to.label = from.label;
    to.hidden = from.hidden;
  };
  const taken = new Set<Binding>();

  // 1 + 2: by position in the graph.
  for (const from of old.bindings) {
    const node = locate(oldPrompt, newPrompt, from.node, from.input);
    const to = node !== null ? at(node, from.input) : undefined;
    if (to && !taken.has(to)) {
      taken.add(to);
      carry(from, to, true);
    }
  }
  // 3: by role.
  for (const from of old.bindings) {
    if (matched.has(from) || !from.role) continue;
    const to = bindings.find((b) => b.role === from.role && !taken.has(b));
    if (to) {
      taken.add(to);
      carry(from, to, false);
    }
  }
  // Hand-exposed parameters the analyzer doesn't find on its own follow their node.
  for (const from of old.bindings) {
    if (matched.has(from) || from.role || from.type === "loras") continue;
    const node = locate(oldPrompt, newPrompt, from.node, from.input);
    if (node === null || at(node, from.input)) continue;
    const moved: Binding = {
      ...from,
      node,
      id: node === from.node ? from.id : `n${node}.${from.input}`,
    };
    if (bindings.some((b) => b.id === moved.id)) continue;
    bindings.push(moved);
    taken.add(moved);
    matched.add(from);
    if (from.id in old.values) values[moved.id] = old.values[from.id];
  }

  // Old values whose binding found no new home stay, under their old ids.
  for (const [id, v] of Object.entries(old.values))
    if (!(id in values) && !bindings.some((b) => b.id === id)) {
      const from = old.bindings.find((b) => b.id === id);
      if (!from || !matched.has(from)) values[id] = v;
    }

  const visible = (b: Binding) => !b.hidden && b.type !== "loras";
  const report: ResyncReport = {
    kept: [...matched].filter((b) => b.id in old.values).length,
    changed,
    added: bindings.filter((b) => !taken.has(b) && visible(b)).map((b) => b.label),
    removed: old.bindings.filter((b) => !matched.has(b) && visible(b)).map((b) => b.label),
  };
  // A batch workflow stays one; a generate workflow follows what the graph is now.
  const kind = old.kind === "batch" ? "batch" : analysis.kind;
  return { bindings, values, kind, report, findings: analysis.findings };
}
