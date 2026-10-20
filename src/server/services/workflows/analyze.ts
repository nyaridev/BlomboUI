/**
 * The analyzer (ADR-0003): reads an API graph and proposes bindings, values and findings.
 *
 * It finds the main sampler (the one that starts from an empty latent), then walks links from
 * it: conditioning back to the prompt text, the model chain back to its loader, the CLIP chain
 * through clip-skip to its loader, the latent back to its size. Nodes titled `$Something`
 * expose their widget inputs as extra parameters. object_info (when ComfyUI is reachable) adds
 * types, ranges and choices; without it, types come from the current values.
 */

import {
  type ApiLink,
  type ApiPrompt,
  type InputInfo,
  isApiLink,
  nodeInputs,
  type ObjectInfo,
} from "../../../shared/workflow/graph.ts";
import type { Binding, BindingType, Finding } from "../../../shared/workflow/manifest.ts";
import { ROLE_LABELS, type Role } from "../../../shared/workflow/roles.ts";
import type { Port } from "../../../shared/workflow/stages.ts";
import {
  CONDITIONING_PASS,
  FRONTEND_ONLY_CLASSES,
  IMAGE_INPUT_CLASSES,
  IMAGE_OUTPUT_CLASSES,
  LORA_STACK_CLASSES,
  MODEL_INPUTS,
  ROLE_RANGES,
  SEED_INPUTS,
  TEXT_INPUTS,
} from "./nodes.ts";

export interface Analysis {
  bindings: Binding[];
  values: Record<string, unknown>;
  findings: Finding[];
  kind: "generate" | "batch";
}

interface Ref {
  node: string;
  input: string;
}

const MORE = "More from this workflow";

/** Read-only view of an API graph with object_info lookups. */
export class GraphView {
  readonly prompt: ApiPrompt;
  readonly info: ObjectInfo | null;
  private readonly inputCache = new Map<string, InputInfo[]>();

  constructor(prompt: ApiPrompt, info: ObjectInfo | null) {
    this.prompt = prompt;
    this.info = info;
  }

  ids(): string[] {
    return Object.keys(this.prompt).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  }

  classOf(id: string): string {
    return this.prompt[id]?.class_type ?? "";
  }

  title(id: string): string {
    return this.prompt[id]?._meta?.title?.trim() || this.classOf(id);
  }

  inputs(id: string): Record<string, unknown> {
    return this.prompt[id]?.inputs ?? {};
  }

  link(id: string, input: string): ApiLink | null {
    const v = this.inputs(id)[input];
    return isApiLink(v) ? [String(v[0]), v[1]] : null;
  }

  inputInfo(id: string, input: string): InputInfo | undefined {
    const cls = this.classOf(id);
    let list = this.inputCache.get(cls);
    if (!list) {
      list = nodeInputs(this.info?.[cls]);
      this.inputCache.set(cls, list);
    }
    return list.find((i) => i.name === input);
  }

  /** Inputs that hold values rather than links. */
  widgets(id: string): string[] {
    return Object.entries(this.inputs(id))
      .filter(([name, v]) => {
        if (isApiLink(v)) return false;
        if (v !== null && typeof v === "object") return false;
        const info = this.inputInfo(id, name);
        return !info || ["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"].includes(info.type);
      })
      .map(([name]) => name);
  }

  isOutput(id: string): boolean {
    const def = this.info?.[this.classOf(id)];
    if (def) return def.output_node === true;
    return IMAGE_OUTPUT_CLASSES.has(this.classOf(id));
  }

  isSampler(id: string): boolean {
    const i = this.inputs(id);
    return (
      ("latent_image" in i && ("positive" in i || "guider" in i)) ||
      ("sigmas" in i && "guider" in i) ||
      ("model" in i && "steps" in i && "positive" in i)
    );
  }

  /**
   * Where a widget value really lives. A seed or text input converted to a link points at a
   * small source node (a primitive or "Seed" node); follow it to that node's widget.
   */
  widgetRef(id: string, input: string, depth = 0): Ref | null {
    const v = this.inputs(id)[input];
    if (v === undefined) return null;
    if (!isApiLink(v)) return { node: id, input };
    if (depth > 4) return null;
    const src = String(v[0]);
    const srcWidgets = this.widgets(src);
    if (srcWidgets.includes(input)) return this.widgetRef(src, input, depth + 1);
    const links = Object.values(this.inputs(src)).filter(isApiLink);
    if (srcWidgets.length === 1 && links.length === 0)
      return { node: src, input: srcWidgets[0] as string };
    return null;
  }
}

/* ── tracing ──────────────────────────────────────────────────────────────── */

interface SamplerParts {
  id: string;
  seed: Ref | null;
  steps: Ref | null;
  cfg: Ref | null;
  sampler: Ref | null;
  scheduler: Ref | null;
  denoise: Ref | null;
  positive: ApiLink | null;
  negative: ApiLink | null;
  model: ApiLink | null;
  latent: ApiLink | null;
}

/** A sampler's settings may sit on helper nodes (SamplerCustomAdvanced: noise, guider, sigmas). */
function samplerParts(g: GraphView, id: string): SamplerParts {
  const holders = [id];
  for (const via of ["noise", "guider", "sampler", "sigmas"]) {
    const l = g.link(id, via);
    if (l) holders.push(l[0]);
  }
  const find = (names: string[]): Ref | null => {
    for (const h of holders) for (const n of names) if (n in g.inputs(h)) return g.widgetRef(h, n);
    return null;
  };
  const findLink = (names: string[]): ApiLink | null => {
    for (const h of holders)
      for (const n of names) {
        const l = g.link(h, n);
        if (l) return l;
      }
    return null;
  };
  return {
    id,
    seed: find(SEED_INPUTS),
    steps: find(["steps"]),
    cfg: find(["cfg"]),
    sampler: find(["sampler_name"]),
    scheduler: find(["scheduler"]),
    denoise: find(["denoise"]),
    positive: findLink(["positive", "conditioning"]),
    negative: findLink(["negative"]),
    model: findLink(["model"]),
    latent: g.link(id, "latent_image"),
  };
}

/** Follow a latent link back to the node that sets the image size, if any. */
function traceLatentSize(g: GraphView, link: ApiLink | null): string | null {
  let cur = link;
  for (let i = 0; cur && i < 12; i++) {
    const id = cur[0];
    const inputs = g.inputs(id);
    if ("width" in inputs && "height" in inputs && !g.isSampler(id)) return id;
    if (g.isSampler(id)) return null;
    cur = g.link(id, "samples") ?? g.link(id, "latent") ?? g.link(id, "latent_image");
  }
  return null;
}

function traceText(g: GraphView, link: ApiLink | null, side: "positive" | "negative"): Ref | null {
  let cur = link;
  for (let i = 0; cur && i < 16; i++) {
    const id = cur[0];
    for (const name of TEXT_INPUTS) {
      if (!(name in g.inputs(id))) continue;
      const ref = g.widgetRef(id, name);
      if (ref && typeof g.inputs(ref.node)[ref.input] === "string") return ref;
    }
    cur = g.link(id, side) ?? firstLink(g, id, CONDITIONING_PASS);
  }
  return null;
}

/** Walk a chain through `input` (model or clip) to its source; returns every node on the way. */
function traceChain(
  g: GraphView,
  link: ApiLink | null,
  input: string,
): { nodes: string[]; source: ApiLink | null } {
  const nodes: string[] = [];
  let cur = link;
  let source: ApiLink | null = null;
  for (let i = 0; cur && i < 32; i++) {
    nodes.push(cur[0]);
    source = cur;
    cur = g.link(cur[0], input);
  }
  return { nodes, source };
}

function mainSampler(g: GraphView): string | null {
  const samplers = g.ids().filter((id) => g.isSampler(id));
  return (
    samplers.find((id) => traceLatentSize(g, g.link(id, "latent_image"))) ?? samplers[0] ?? null
  );
}

/** Where LoRAs go when a graph has no LoRA stack: right after the model and CLIP loaders. */
export function findLoraSources(
  prompt: ApiPrompt,
): { model: ApiLink; clip: ApiLink | null } | null {
  const g = new GraphView(prompt, null);
  const sid = mainSampler(g);
  if (!sid) return null;
  const parts = samplerParts(g, sid);
  const model = traceChain(g, parts.model, "model").source;
  if (!model) return null;
  const encoder = findEncoder(g, parts.positive);
  const clip = encoder ? traceChain(g, g.link(encoder, "clip"), "clip").source : null;
  return { model, clip };
}

function firstLink(g: GraphView, id: string, names: string[]): ApiLink | null {
  for (const n of names) {
    const l = g.link(id, n);
    if (l) return l;
  }
  return null;
}

/** The text-encoder node on a conditioning chain (the first node that has a `clip` link). */
function findEncoder(g: GraphView, link: ApiLink | null): string | null {
  let cur = link;
  for (let i = 0; cur && i < 16; i++) {
    const id = cur[0];
    if (g.link(id, "clip")) return id;
    cur = g.link(id, "positive") ?? firstLink(g, id, CONDITIONING_PASS);
  }
  return null;
}

/** The LoRA stack node on the main model chain, if the graph has one. */
export function findLoraStack(prompt: ApiPrompt): string | null {
  const g = new GraphView(prompt, null);
  const sid = mainSampler(g);
  if (!sid) return null;
  return (
    traceChain(g, samplerParts(g, sid).model, "model").nodes.find((id) =>
      LORA_STACK_CLASSES.has(g.classOf(id)),
    ) ?? null
  );
}

/** Where stages attach (ADR-0004): one link per port, found from the main sampler. */
export type PortLinks = Partial<Record<Port, ApiLink>>;

/**
 * The splice points of a graph: the model, conditioning and latent going into the main sampler,
 * the CLIP its prompt is encoded with, and the VAE and image of the decoder that reads its
 * output. Run it after LoRAs are chained so MODEL and CLIP include them.
 */
export function findPorts(prompt: ApiPrompt): PortLinks {
  const g = new GraphView(prompt, null);
  const sid = mainSampler(g);
  if (!sid) return {};
  const parts = samplerParts(g, sid);
  const ports: PortLinks = {};
  if (parts.model) ports.MODEL = parts.model;
  if (parts.positive) ports.POSITIVE = parts.positive;
  if (parts.negative) ports.NEGATIVE = parts.negative;
  const encoder = findEncoder(g, parts.positive);
  const clip = encoder ? g.link(encoder, "clip") : null;
  if (clip) ports.CLIP = clip;
  // The decoder that reads this sampler's output (directly or through latent helpers).
  for (const id of g.ids()) {
    const samples = g.link(id, "samples");
    const vae = g.link(id, "vae");
    if (!samples || !vae || samples[0] !== sid) continue;
    ports.LATENT = samples;
    ports.VAE = vae;
    ports.IMAGE = [id, 0];
    break;
  }
  return ports;
}

/** Nodes that sample (their progress is a pass on the progress bar), in id order. */
export function samplerNodes(prompt: ApiPrompt): string[] {
  const g = new GraphView(prompt, null);
  return g.ids().filter((id) => g.isSampler(id));
}

/** Current choices from object_info (new models, new samplers), without saving them. */
export function refreshBindings(
  bindings: Binding[],
  prompt: ApiPrompt,
  info: ObjectInfo | null,
): Binding[] {
  if (!info) return bindings;
  const g = new GraphView(prompt, info);
  return bindings.map((b) => {
    if (b.type !== "enum" && b.type !== "model") return b;
    const options = g.inputInfo(b.node, b.input)?.options;
    return options ? { ...b, options } : b;
  });
}

/** Sampler passes in a graph: the progress bar splits into this many segments. */
export function countSamplers(prompt: ApiPrompt): number {
  const g = new GraphView(prompt, null);
  return Math.max(1, g.ids().filter((id) => g.isSampler(id)).length);
}

/* ── bindings ─────────────────────────────────────────────────────────────── */

export function prettify(input: string): string {
  const s = input.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function bindingType(
  g: GraphView,
  ref: Ref,
  role: Role | undefined,
  info: InputInfo | undefined,
): BindingType {
  if (role === "prompt.positive" || role === "prompt.negative") return "prompt";
  if (role === "sampler.seed") return "seed";
  if (role === "image.input") return "image";
  if (MODEL_INPUTS[ref.input] && (!info || info.type === "COMBO")) return "model";
  if (info) {
    if (info.type === "INT") return "int";
    if (info.type === "FLOAT") return "float";
    if (info.type === "BOOLEAN") return "bool";
    if (info.type === "COMBO") return "enum";
    return "string";
  }
  const v = g.inputs(ref.node)[ref.input];
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number")
    return Number.isInteger(v) && role !== "sampler.cfg" && role !== "sampler.denoise"
      ? "int"
      : "float";
  return "string";
}

function makeBinding(
  g: GraphView,
  ref: Ref,
  id: string,
  role: Role | undefined,
  extra: Partial<Binding> = {},
): Binding {
  const info = g.inputInfo(ref.node, ref.input);
  const type = bindingType(g, ref, role, info);
  const range = role ? ROLE_RANGES[role] : undefined;
  const b: Binding = {
    id,
    node: ref.node,
    input: ref.input,
    type,
    label: (role && ROLE_LABELS[role]) || prettify(ref.input),
    hidden: false,
    ...(role ? { role } : {}),
  };
  if (type === "int" || type === "float") {
    const min = range?.min ?? info?.min;
    const max = range?.max ?? info?.max;
    const step = range?.step ?? info?.step;
    if (min !== undefined) b.min = min;
    if (max !== undefined) b.max = max;
    if (step !== undefined) b.step = type === "int" ? Math.max(1, Math.round(step)) : step;
    if (range?.presets) b.presets = range.presets;
  }
  if ((type === "enum" || type === "model") && info?.options) b.options = info.options;
  if (type === "model") {
    const kind = MODEL_INPUTS[ref.input];
    if (kind) b.modelKind = kind;
  }
  if (type === "string" && info?.multiline) b.multiline = true;
  return { ...b, ...extra };
}

export function analyze(prompt: ApiPrompt, objectInfo: ObjectInfo | null): Analysis {
  const g = new GraphView(prompt, objectInfo);
  const bindings: Binding[] = [];
  const findings: Finding[] = [];
  const used = new Set<string>();
  const key = (r: Ref) => `${r.node}\u0000${r.input}`;

  const add = (ref: Ref | null, role: Role, extra: Partial<Binding> = {}) => {
    if (!ref || used.has(key(ref)) || bindings.some((b) => b.role === role)) return;
    used.add(key(ref));
    bindings.push(makeBinding(g, ref, role, role, extra));
  };

  // Unknown node classes (only knowable with object_info).
  if (objectInfo) {
    const missing = new Set<string>();
    for (const id of g.ids()) {
      const cls = g.classOf(id);
      if (!objectInfo[cls] && !FRONTEND_ONLY_CLASSES.has(cls)) missing.add(cls);
    }
    for (const cls of missing)
      findings.push({
        level: "error",
        code: "missing_node",
        message: `Missing custom node "${cls}". Install it with ComfyUI Manager, then restart ComfyUI.`,
      });
  }

  const sid = mainSampler(g);
  if (sid) {
    const parts = samplerParts(g, sid);
    add(traceText(g, parts.positive, "positive"), "prompt.positive");
    add(traceText(g, parts.negative, "negative"), "prompt.negative");

    const model = traceChain(g, parts.model, "model");
    const loader = model.nodes[model.nodes.length - 1];
    if (loader) {
      if ("ckpt_name" in g.inputs(loader))
        add(g.widgetRef(loader, "ckpt_name"), "model.checkpoint");
      else if ("unet_name" in g.inputs(loader)) add(g.widgetRef(loader, "unet_name"), "model.unet");
    }
    const stack = model.nodes.find((id) => LORA_STACK_CLASSES.has(g.classOf(id)));
    if (stack) {
      used.add(key({ node: stack, input: "lora_*" }));
      bindings.push({
        id: "lora.stack",
        role: "lora.stack",
        node: stack,
        input: "lora_*",
        type: "loras",
        label: ROLE_LABELS["lora.stack"] ?? "LoRAs",
        hidden: true,
      });
    }

    const encoder = findEncoder(g, parts.positive);
    if (encoder) {
      const clip = traceChain(g, g.link(encoder, "clip"), "clip");
      const skip = clip.nodes.find((id) => "stop_at_clip_layer" in g.inputs(id));
      if (skip) add(g.widgetRef(skip, "stop_at_clip_layer"), "clip.skip");
      const clipLoader = clip.nodes[clip.nodes.length - 1];
      if (clipLoader && !("ckpt_name" in g.inputs(clipLoader))) {
        const first = ["clip_name", "clip_name1"].find((n) => n in g.inputs(clipLoader));
        if (first) add(g.widgetRef(clipLoader, first), "model.clip");
        if ("clip_name2" in g.inputs(clipLoader))
          add(g.widgetRef(clipLoader, "clip_name2"), "model.clip2");
      }
    }

    add(parts.sampler, "sampler.name");
    add(parts.scheduler, "sampler.scheduler");
    add(parts.steps, "sampler.steps");
    add(parts.cfg, "sampler.cfg");
    add(parts.seed, "sampler.seed");

    const latent = traceLatentSize(g, parts.latent);
    if (latent) {
      add(g.widgetRef(latent, "width"), "latent.width");
      add(g.widgetRef(latent, "height"), "latent.height");
      if ("batch_size" in g.inputs(latent)) add(g.widgetRef(latent, "batch_size"), "latent.batch");
    }
    // Denoise only matters when the sampler starts from an existing image.
    add(parts.denoise, "sampler.denoise", { hidden: Boolean(latent) });
  } else {
    findings.push({
      level: "info",
      code: "no_sampler",
      message: "No sampler found. Prompt, model and size controls won't show for this workflow.",
    });
  }

  // VAE: from the decoder that feeds an output.
  for (const id of g.ids()) {
    if (!g.link(id, "vae") || !g.link(id, "samples")) continue;
    const vae = traceChain(g, g.link(id, "vae"), "vae");
    const src = vae.nodes[vae.nodes.length - 1];
    if (src && "vae_name" in g.inputs(src)) add(g.widgetRef(src, "vae_name"), "model.vae");
    break;
  }

  // Image inputs and outputs.
  for (const id of g.ids()) {
    if (typeof g.inputs(id).image !== "string") continue;
    const spec = objectInfo?.[g.classOf(id)]?.input.required?.image?.[1];
    const upload = Boolean(spec && typeof spec === "object" && "image_upload" in spec);
    if (IMAGE_INPUT_CLASSES.has(g.classOf(id)) || upload)
      add({ node: id, input: "image" }, "image.input");
  }
  const outputs = g.ids().filter((id) => g.isOutput(id));
  const save = outputs.find((id) => "filename_prefix" in g.inputs(id));
  if (save)
    add({ node: save, input: "filename_prefix" }, "output.image", { hidden: true, type: "string" });
  if (outputs.length === 0)
    findings.push({
      level: "warning",
      code: "no_output",
      message: "This workflow has no Save Image or Preview Image node, so it won't produce images.",
    });

  // $-titled nodes expose their widget inputs.
  for (const id of g.ids()) {
    const title = g.prompt[id]?._meta?.title?.trim() ?? "";
    if (!title.startsWith("$")) continue;
    const name = title.slice(1).trim() || g.classOf(id);
    const widgets = g.widgets(id);
    for (const input of widgets) {
      const ref = { node: id, input };
      const label = widgets.length === 1 ? name : `${name} · ${prettify(input)}`;
      const existing = bindings.find((b) => b.node === id && b.input === input);
      if (existing) {
        if (widgets.length === 1) existing.label = name;
        existing.hidden = false;
        continue;
      }
      used.add(key(ref));
      bindings.push(
        makeBinding(g, ref, `n${id}.${input}`, undefined, {
          label,
          group: widgets.length === 1 ? MORE : name,
        }),
      );
    }
  }

  // Values come straight from the graph.
  const values: Record<string, unknown> = {};
  for (const b of bindings) {
    if (b.type === "loras") continue;
    const v = g.inputs(b.node)[b.input];
    if (v !== undefined && !isApiLink(v)) values[b.id] = v;
  }

  // Models the graph names that ComfyUI doesn't have.
  for (const b of bindings) {
    if (b.type !== "model" || !b.options) continue;
    const v = values[b.id];
    if (typeof v === "string" && !b.options.includes(v))
      findings.push({
        level: "warning",
        code: "missing_model",
        node: b.node,
        message: `"${v}" isn't in your ${b.modelKind ?? "models"} folder. Pick another ${b.label.toLowerCase()} before generating.`,
      });
  }

  const kind = !sid && bindings.some((b) => b.role === "image.input") ? "batch" : "generate";
  return { bindings, values, findings, kind };
}
