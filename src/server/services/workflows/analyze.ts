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
import type {
  Binding,
  BindingType,
  Finding,
  WorkflowKind,
} from "../../../shared/workflow/manifest.ts";
import { ROLE_LABELS, type Role } from "../../../shared/workflow/roles.ts";
import type { Port } from "../../../shared/workflow/stages.ts";
import {
  AV_SPLIT_INPUT,
  CONDITIONING_PASS,
  FPS_INPUTS,
  FRONTEND_ONLY_CLASSES,
  IMAGE_INPUT_CLASSES,
  IMAGE_OUTPUT_CLASSES,
  LATENT_PASS,
  LORA_STACK_CLASSES,
  MODEL_INPUTS,
  PASS_INPUTS,
  ROLE_RANGES,
  SEED_INPUTS,
  TEXT_INPUTS,
  VIDEO_INPUT_CLASSES,
  VIDEO_OUTPUT_CLASSES,
} from "./nodes.ts";

export interface Analysis {
  bindings: Binding[];
  values: Record<string, unknown>;
  findings: Finding[];
  kind: WorkflowKind;
}

interface Ref {
  node: string;
  input: string;
}

const MORE = "More from this workflow";
const SIZE = "Size";

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
    return IMAGE_OUTPUT_CLASSES.has(this.classOf(id)) || VIDEO_OUTPUT_CLASSES.has(this.classOf(id));
  }

  /** An output node that saves a video (it takes a `video` link, or is a known video saver). */
  makesVideo(id: string): boolean {
    return (
      this.isOutput(id) &&
      (isApiLink(this.inputs(id).video) || VIDEO_OUTPUT_CLASSES.has(this.classOf(id)))
    );
  }

  /** An output node that shows text (captioners, taggers). Only object_info can tell. */
  showsText(id: string): boolean {
    const def = this.info?.[this.classOf(id)];
    return Boolean(def?.output_node && def.output?.includes("STRING"));
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
    cur = firstLink(g, id, LATENT_PASS);
  }
  return null;
}

/** The node that sets a video's size and length (it has a `length`), or null for images. */
function videoLatent(g: GraphView, link: ApiLink | null): string | null {
  const id = traceLatentSize(g, link);
  return id && "length" in g.inputs(id) ? id : null;
}

/** The node that turns frames into the video an output saves (CreateVideo, or the saver itself). */
function videoMaker(g: GraphView): string | null {
  for (const id of g.ids()) {
    if (!g.makesVideo(id)) continue;
    for (const node of [id, g.link(id, "video")?.[0]])
      if (node && isApiLink(g.inputs(node).images)) return node;
  }
  return null;
}

/** The node making the video an output saves, and the frame rate it's made at. */
function videoFps(g: GraphView): Ref | null {
  for (const id of g.ids()) {
    if (!g.makesVideo(id)) continue;
    for (const node of [id, g.link(id, "video")?.[0]])
      for (const name of FPS_INPUTS)
        if (node && name in g.inputs(node)) return g.widgetRef(node, name);
  }
  return null;
}

function traceText(g: GraphView, link: ApiLink | null, side: "positive" | "negative"): Ref | null {
  let cur = link;
  for (let i = 0; cur && i < 16; i++) {
    const id = cur[0];
    for (const name of TEXT_INPUTS) {
      if (!(name in g.inputs(id))) continue;
      // A linked `positive` is conditioning (LTXVConditioning), not a prompt node's text.
      if (name === "positive" && g.link(id, name)) continue;
      const ref = g.widgetRef(id, name) ?? traceString(g, g.link(id, name));
      if (ref && typeof g.inputs(ref.node)[ref.input] === "string") return ref;
    }
    cur = g.link(id, side) ?? firstLink(g, id, CONDITIONING_PASS);
  }
  return null;
}

/** A text input fed through switches and previews: the text widget it starts at. */
function traceString(g: GraphView, link: ApiLink | null): Ref | null {
  let cur = link;
  for (let i = 0; cur && i < 16; i++) {
    const id = cur[0];
    for (const name of TEXT_INPUTS) {
      const ref = g.widgetRef(id, name);
      if (ref && typeof g.inputs(ref.node)[ref.input] === "string") return ref;
    }
    cur = firstLink(g, id, PASS_INPUTS);
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
    cur = g.link(cur[0], input) ?? firstLink(g, cur[0], PASS_INPUTS);
  }
  return { nodes, source };
}

function mainSampler(g: GraphView): string | null {
  const samplers = g.ids().filter((id) => g.isSampler(id));
  return (
    samplers.find((id) => traceLatentSize(g, g.link(id, "latent_image"))) ?? samplers[0] ?? null
  );
}

/**
 * The last sampler of the chain that starts at `sid`: Wan 2.2 14B's low noise pass samples the
 * high noise pass's latent, and the decoder reads the last one.
 */
function chainEnd(g: GraphView, sid: string): string {
  let cur = sid;
  for (let i = 0; i < 8; i++) {
    const next = g
      .ids()
      .find((id) => id !== cur && g.isSampler(id) && g.link(id, "latent_image")?.[0] === cur);
    if (!next) break;
    cur = next;
  }
  return cur;
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
  if (parts.latent) ports.START = parts.latent;
  const video = videoLatent(g, parts.latent);
  // START itself when the sampler reads it straight (its output slot: MiniMax H3's is the second).
  if (video) ports.VIDEO = parts.latent?.[0] === video ? parts.latent : [video, 0];
  const encoder = findEncoder(g, parts.positive);
  const clip = encoder ? g.link(encoder, "clip") : null;
  if (clip) ports.CLIP = clip;
  // The decoder that reads this sampler's output (directly, or the video half of an audio +
  // video latent split after sampling).
  const end = chainEnd(g, sid);
  const fromSampler = (link: ApiLink) =>
    link[0] === end || g.link(link[0], AV_SPLIT_INPUT)?.[0] === end;
  // A video with sound: the audio going into the video maker, and the VAE that decoded it.
  const maker = videoMaker(g);
  const sound = maker ? g.link(maker, "audio") : null;
  if (sound) {
    ports.SOUND = sound;
    const audioVae = g.link(sound[0], "vae");
    if (audioVae) ports.AUDIO_VAE = audioVae;
  }
  // A frame rate that comes from another node (a swap's input video), not a setting.
  const fps = maker ? FPS_INPUTS.map((name) => g.link(maker, name)).find(Boolean) : null;
  if (fps) ports.FPS = fps;
  for (const id of g.ids()) {
    const samples = g.link(id, "samples");
    const vae = g.link(id, "vae");
    if (!samples || !vae || !fromSampler(samples) || id === sound?.[0]) continue;
    ports.LATENT = samples;
    ports.VAE = vae;
    ports.IMAGE = [id, 0];
    break;
  }
  return ports;
}

/** Where the main sampler takes a setting (denoise sits on the scheduler with custom samplers). */
export function mainSamplerInput(prompt: ApiPrompt, input: "denoise"): Ref | null {
  const g = new GraphView(prompt, null);
  const sid = mainSampler(g);
  return sid ? samplerParts(g, sid)[input] : null;
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

export type OutputRole = Extract<Role, "output.image" | "output.text" | "output.video">;

/**
 * What a graph's output nodes make: `output.image` for one that takes images (Save Image,
 * Preview Image…), `output.text` for one that shows text (a caption or tags; needs object_info),
 * `output.video` for one that saves a video. The batch runner decides what it writes from these;
 * Generate treats a workflow with a video output as a video workflow.
 */
export function outputRoles(prompt: ApiPrompt, info: ObjectInfo | null): Set<OutputRole> {
  const g = new GraphView(prompt, info);
  const roles = new Set<OutputRole>();
  for (const id of g.ids()) {
    if (!g.isOutput(id)) continue;
    if (isApiLink(g.inputs(id).images)) roles.add("output.image");
    if (g.showsText(id)) roles.add("output.text");
    if (g.makesVideo(id)) roles.add("output.video");
  }
  return roles;
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
  if (role === "video.input") return "video";
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
    // A node on a coarser grid than the role's keeps its own (MiniMax H3: sizes by 32, frames
    // 17k + 5), without the role's presets, which would fall off it.
    const coarser = (info?.step ?? 0) > (range?.step ?? Number.POSITIVE_INFINITY);
    const min = coarser ? (info?.min ?? range?.min) : (range?.min ?? info?.min);
    const max = range?.max ?? info?.max;
    const step = coarser ? info?.step : (range?.step ?? info?.step);
    if (min !== undefined) b.min = min;
    if (max !== undefined) b.max = max;
    if (step !== undefined) b.step = type === "int" ? Math.max(1, Math.round(step)) : step;
    if (range?.presets && !coarser) b.presets = range.presets;
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
    // A second pass on its own model (Wan 2.2 14B: high noise, then low noise).
    const end = chainEnd(g, sid);
    const second = traceChain(g, samplerParts(g, end).model, "model").nodes.at(-1);
    if (end !== sid && second && second !== loader && "unet_name" in g.inputs(second)) {
      add(g.widgetRef(second, "unet_name"), "model.unet2");
      const first = bindings.find((b) => b.role === "model.unet");
      if (first) first.label = "High noise model";
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
      if (clipLoader) {
        // A checkpoint's own CLIP has none of these; LTX's loader names its file text_encoder.
        const first = ["clip_name", "clip_name1", "text_encoder"].find(
          (n) => n in g.inputs(clipLoader),
        );
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
      const width = g.widgetRef(latent, "width");
      const height = g.widgetRef(latent, "height");
      add(width, "latent.width");
      add(height, "latent.height");
      // The size comes from a node with settings of its own (aspect ratio, megapixels).
      const from = g.link(latent, "width")?.[0];
      if (!width && !height && from && from === g.link(latent, "height")?.[0])
        for (const input of g.widgets(from)) {
          const ref = { node: from, input };
          if (used.has(key(ref))) continue;
          used.add(key(ref));
          bindings.push(makeBinding(g, ref, `n${from}.${input}`, undefined, { group: SIZE }));
        }
      if ("batch_size" in g.inputs(latent)) add(g.widgetRef(latent, "batch_size"), "latent.batch");
      if ("length" in g.inputs(latent)) add(g.widgetRef(latent, "length"), "latent.length");
    }
    add(videoFps(g), "video.fps");
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

  // A file input named in the graph ("Character", "Driving video") keeps that name.
  const named = (id: string): Partial<Binding> => {
    const title = g.prompt[id]?._meta?.title?.trim() ?? "";
    const plain = [g.classOf(id), objectInfo?.[g.classOf(id)]?.display_name];
    return title && !title.startsWith("$") && !plain.includes(title) ? { label: title } : {};
  };
  // Image inputs and outputs.
  for (const id of g.ids()) {
    if (typeof g.inputs(id).image !== "string") continue;
    const spec = objectInfo?.[g.classOf(id)]?.input.required?.image?.[1];
    const upload = Boolean(spec && typeof spec === "object" && "image_upload" in spec);
    if (IMAGE_INPUT_CLASSES.has(g.classOf(id)) || upload)
      add({ node: id, input: "image" }, "image.input", named(id));
  }
  // A video input, and where in it the workflow starts (an image batch slice of its frames).
  for (const id of g.ids()) {
    if (typeof g.inputs(id).file !== "string") continue;
    const spec = objectInfo?.[g.classOf(id)]?.input.required?.file?.[1];
    const upload = Boolean(spec && typeof spec === "object" && "video_upload" in spec);
    if (!VIDEO_INPUT_CLASSES.has(g.classOf(id)) && !upload) continue;
    add({ node: id, input: "file" }, "video.input", named(id));
    // The window of it the workflow reads (Video Slice: cut before it's decoded).
    const cut = g
      .ids()
      .find(
        (c) =>
          g.link(c, "video")?.[0] === id &&
          "start_time" in g.inputs(c) &&
          "duration" in g.inputs(c),
      );
    if (cut) {
      add(g.widgetRef(cut, "start_time"), "video.start");
      add(g.widgetRef(cut, "duration"), "video.seconds");
    }
    const from = [id, ...(cut ? [cut] : [])];
    const frames = g.ids().filter((c) => from.includes(g.link(c, "video")?.[0] ?? ""));
    const slice = g.ids().find(
      (s) =>
        frames.includes(g.link(s, "image")?.[0] ?? "") &&
        typeof g.inputs(s).batch_index === "number" &&
        // One frame is a look at the video (its size), not where the workflow starts.
        g.inputs(s).length !== 1,
    );
    if (slice) {
      // With a cut, the window's start says where it begins (the chain sets this to 0).
      add(g.widgetRef(slice, "batch_index"), "video.offset", cut ? { hidden: true } : {});
      // The most frames one run takes from it: a longer window runs in parts.
      add(g.widgetRef(slice, "length"), "video.frames", { hidden: true });
    }
    // The size the video is scaled to (megapixels, its shape kept), a few image steps after it.
    const fromVideo = (start: string) => {
      let cur: string | undefined = start;
      for (let i = 0; cur && i < 4; i++) {
        if (frames.includes(cur)) return true;
        cur = g.link(cur, "image")?.[0];
      }
      return false;
    };
    const scaler = g.ids().find((s) => typeof g.inputs(s).megapixels === "number" && fromVideo(s));
    if (scaler) add(g.widgetRef(scaler, "megapixels"), "video.megapixels");
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
