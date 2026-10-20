/**
 * Splicing stages into a compiled graph (ADR-0004). Pure: the stage packages, settings and
 * ComfyUI's node list come in, the graph is patched in place, and what's missing comes back as
 * problems the UI shows before you generate (and the compiler refuses to run).
 *
 * A stage graph (presets/stages/<id>/prompt.json) is a ComfyUI API graph with three extras:
 *
 *  - `PORT:<PORT>` stub nodes stand for the workflow's link at that port. `inputs.from: "base"`
 *    takes the port as the workflow had it before any stage changed it (ADetailer redraws with
 *    the plain prompt, not the ControlNet one); `inputs.optional: true` drops inputs linked to
 *    it when the workflow has no such port.
 *  - `OUT:<PORT>` nodes republish a port: whatever read the old link now reads `inputs.value`.
 *  - `_meta.blombo` on a node: `when: <flag>` keeps it only when the flag is on; otherwise the
 *    node is left out and links to it follow `else` ("input:<name>" passes that input through,
 *    "node:<id>" uses another node, nothing drops the link). `inputsWhen: { input: flag }`
 *    keeps an input only when its flag is on.
 *
 * Stages run in a fixed order (controlnet → the workflow's own sampling → hires → adetailer
 * units), each reading the ports the previous one left.
 */
import { findLoraTags, stripLoraTags } from "../../../shared/prompt/loras.ts";
import { expandPrompt, type WildcardResolver } from "../../../shared/prompt/wildcards.ts";
import {
  type ApiLink,
  type ApiNode,
  type ApiPrompt,
  isApiLink,
  nodeInputs,
  type ObjectInfo,
} from "../../../shared/workflow/graph.ts";
import { type Binding, bindingFor } from "../../../shared/workflow/manifest.ts";
import type { StageId } from "../../../shared/workflow/roles.ts";
import {
  type AdetailerUnit,
  type ControlnetUnit,
  hiresSize,
  inheritedValue,
  type NodePack,
  PORTS,
  type Port,
  type RunSegment,
  STAGE_LABELS,
  type StageFamily,
  type StagePackage,
  type StageProblem,
  type StageSettings,
  type StageStatus,
  workflowFamily,
} from "../../../shared/workflow/stages.ts";
import { findPorts, GraphView, type PortLinks } from "./analyze.ts";
import { CompileError, chainLoras, idGenerator, lorasIn } from "./loras.ts";

export interface LoadedStage {
  pkg: StagePackage;
  graph: ApiPrompt;
}

export interface StageContext {
  bindings: Binding[];
  /** The base workflow's values (binding id → value), for inherited fields and the size. */
  values: Record<string, unknown>;
  seed: number;
  /** Wildcards for stage prompts; null skips expansion (status checks). */
  wildcards: WildcardResolver | null;
  random: () => number;
  /** LoRA files for <lora:…> tags in stage prompts; "skip" leaves tags out (status checks). */
  loraFiles: string[] | null | "skip";
  /** Stage image file → its name in ComfyUI's input folder; null when not uploaded (status). */
  images: Record<string, string> | null;
  filenamePrefix: string;
  /** ComfyUI's node definitions; null when it isn't running (nodes and models go unchecked). */
  info: ObjectInfo | null;
}

export interface StageResult {
  segments: RunSegment[];
  statuses: StageStatus[];
  /** Final stage prompt texts, for the image's metadata ("hires.prompt"). */
  texts: Record<string, string>;
}

interface Instance {
  key: string;
  label: string;
  values: Record<string, unknown>;
  flags: Record<string, boolean>;
  unit?: string;
  /** LoRAs from this instance's own prompt. */
  loras: string;
}

interface BlomboMeta {
  when?: string;
  else?: string;
  inputsWhen?: Record<string, string>;
}

const STUB = /^PORT:(\w+)$/;
const OUT = /^OUT:(\w+)$/;

function blombo(node: ApiNode): BlomboMeta {
  const raw = (node._meta as { blombo?: unknown } | undefined)?.blombo;
  return raw && typeof raw === "object" ? (raw as BlomboMeta) : {};
}

function isPort(s: string): s is Port {
  return (PORTS as readonly string[]).includes(s);
}

/** The package for a stage that fits this workflow: its family first, then any that fits. */
export function pickPackage(
  packages: LoadedStage[],
  stage: StageId,
  family: StageFamily,
  ports: PortLinks,
): { found: LoadedStage | null; missing: Port[] } {
  const candidates = packages
    .filter((p) => p.pkg.stage === stage)
    .sort((a, b) => Number(b.pkg.family === family) - Number(a.pkg.family === family));
  for (const c of candidates)
    if (c.pkg.requires.every((p) => ports[p])) return { found: c, missing: [] };
  const first = candidates[0];
  return { found: null, missing: first ? first.pkg.requires.filter((p) => !ports[p]) : [] };
}

/* ── splicing one instance ─────────────────────────────────────────────── */

const DROP = Symbol("drop");
type Resolved = ApiLink | typeof DROP;

/**
 * Copy one stage graph into `prompt` with fresh ids, values and flags applied, then republish
 * its OUT ports (consumers of the old link move to the new one). Returns the added node ids and
 * any port the stage needed but the workflow lacks.
 */
export function spliceStage(
  prompt: ApiPrompt,
  stage: LoadedStage,
  inst: Instance,
  ports: PortLinks,
  basePorts: PortLinks,
  nextId: () => string,
): { added: string[]; missing: Port[] } {
  const graph = stage.graph;
  const missing = new Set<Port>();
  const removed = new Set<string>();
  for (const [id, node] of Object.entries(graph)) {
    const when = blombo(node).when;
    if (when && !inst.flags[when]) removed.add(id);
  }
  const ids = new Map<string, string>();
  for (const [id, node] of Object.entries(graph)) {
    if (removed.has(id) || STUB.test(node.class_type) || OUT.test(node.class_type)) continue;
    ids.set(id, nextId());
  }

  const resolve = (link: ApiLink, depth = 0): Resolved => {
    if (depth > 16) return DROP;
    const [src, slot] = [String(link[0]), link[1]];
    const node = graph[src];
    if (!node) return DROP;
    const stub = STUB.exec(node.class_type);
    if (stub) {
      const port = stub[1] ?? "";
      if (!isPort(port)) return DROP;
      const fromBase = (node.inputs as { from?: unknown }).from === "base";
      const value = fromBase ? basePorts[port] : ports[port];
      if (value) return value;
      if ((node.inputs as { optional?: unknown }).optional !== true) missing.add(port);
      return DROP;
    }
    if (removed.has(src)) {
      const alt = blombo(node).else;
      if (alt?.startsWith("input:")) {
        const v = node.inputs[alt.slice(6)];
        return isApiLink(v) ? resolve([String(v[0]), v[1]], depth + 1) : DROP;
      }
      if (alt?.startsWith("node:")) return resolve([alt.slice(5), slot], depth + 1);
      return DROP;
    }
    const nid = ids.get(src);
    return nid ? [nid, slot] : DROP;
  };

  const fieldsByNode = new Map<string, StagePackage["fields"]>();
  for (const f of stage.pkg.fields)
    fieldsByNode.set(f.node, [...(fieldsByNode.get(f.node) ?? []), f]);

  const added: string[] = [];
  for (const [id, node] of Object.entries(graph)) {
    const nid = ids.get(id);
    if (!nid) continue;
    const meta = blombo(node);
    const inputs: Record<string, unknown> = {};
    for (const [name, v] of Object.entries(node.inputs)) {
      const gate = meta.inputsWhen?.[name];
      if (gate && !inst.flags[gate]) continue;
      if (isApiLink(v)) {
        const r = resolve([String(v[0]), v[1]]);
        if (r !== DROP) inputs[name] = r;
      } else inputs[name] = structuredClone(v);
    }
    for (const f of fieldsByNode.get(id) ?? []) {
      const value = inst.values[f.field];
      if (value !== undefined) inputs[f.input] = value;
    }
    const title = node._meta?.title ?? node.class_type;
    prompt[nid] = {
      class_type: node.class_type,
      inputs,
      _meta: { title: `${inst.label} · ${title}` },
    };
    added.push(nid);
  }

  // Republish ports: everything outside this instance that read the old link reads the new one.
  const addedSet = new Set(added);
  for (const node of Object.values(graph)) {
    const out = OUT.exec(node.class_type);
    const port = out?.[1] ?? "";
    if (!out || !isPort(port)) continue;
    const v = node.inputs.value;
    if (!isApiLink(v)) continue;
    const next = resolve([String(v[0]), v[1]]);
    const old = ports[port];
    if (next === DROP) continue;
    if (old)
      for (const [id, n] of Object.entries(prompt)) {
        if (addedSet.has(id)) continue;
        for (const [name, iv] of Object.entries(n.inputs))
          if (isApiLink(iv) && String(iv[0]) === old[0] && iv[1] === old[1]) n.inputs[name] = next;
      }
    ports[port] = next;
  }
  return { added, missing: [...missing] };
}

/* ── settings → instances ──────────────────────────────────────────────── */

function stageText(raw: string, ctx: StageContext, where: string): { text: string; loras: string } {
  let text = raw;
  if (ctx.wildcards) {
    const expanded = expandPrompt(text, ctx.random, ctx.wildcards);
    if (expanded.missing.length)
      throw new CompileError(
        `No wildcard file for ${expanded.missing.map((m) => `__${m}__`).join(", ")} in the ${where} prompt. Add ${expanded.missing[0]}.txt to the profile's wildcards folder, or fix the name.`,
      );
    text = expanded.text;
  }
  const tags = findLoraTags(text);
  return { text: stripLoraTags(text), loras: tags.length ? text : "" };
}

type Inheriting = Parameters<typeof inheritedValue>[1];

function sampling(
  s: Inheriting,
  ctx: StageContext,
  defaults: Record<string, unknown>,
  where: string,
): { values: Record<string, unknown>; flags: Record<string, boolean>; loras: string } {
  const v = (f: Parameters<typeof inheritedValue>[0]) =>
    inheritedValue(f, s, ctx.bindings, ctx.values, defaults);
  const values: Record<string, unknown> = {
    seed: ctx.seed,
    steps: v("steps"),
    cfg: v("cfg"),
    sampler: v("sampler"),
    scheduler: v("scheduler"),
  };
  const flags = {
    prompt: s.unlinked.includes("prompt"),
    negative: s.unlinked.includes("negative"),
  };
  let loras = "";
  if (flags.prompt) {
    const t = stageText(s.prompt, ctx, where);
    values.prompt = t.text;
    loras = t.loras;
  }
  if (flags.negative) values.negative = stageText(s.negative, ctx, where).text;
  return { values, flags, loras };
}

function baseSize(ctx: StageContext): { width: number; height: number } | null {
  const w = bindingFor(ctx.bindings, "latent.width");
  const h = bindingFor(ctx.bindings, "latent.height");
  const width = Number(w ? ctx.values[w.id] : Number.NaN);
  const height = Number(h ? ctx.values[h.id] : Number.NaN);
  return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : null;
}

function instancesFor(
  stage: StageId,
  settings: StageSettings,
  ctx: StageContext,
  pkg: StagePackage,
  problems: StageProblem[],
): Instance[] {
  const label = STAGE_LABELS[stage];
  if (stage === "hires") {
    const h = settings.hires;
    const size = hiresSize(h, baseSize(ctx));
    if (!size)
      problems.push({
        code: "no_size",
        message:
          "Hires fix can't scale this workflow: it has no width and height. Use Target size instead.",
      });
    const s = sampling(h, ctx, pkg.defaults, "Hires fix");
    return [
      {
        key: "hires",
        label,
        values: {
          ...s.values,
          width: size?.width,
          height: size?.height,
          upscaler: h.upscaler,
          denoise: h.denoise,
          prefix: `${ctx.filenamePrefix}-first`,
        },
        flags: { ...s.flags, upscaler: h.upscaler !== "", saveFirst: h.saveFirst },
        loras: s.loras,
      },
    ];
  }
  if (stage === "adetailer") {
    return settings.adetailer.units
      .filter((u) => u.enabled)
      .map((u: AdetailerUnit) => {
        const s = sampling(u, ctx, pkg.defaults, `ADetailer ${u.name}`);
        return {
          key: `adetailer-${u.id}`,
          label: `${label} · ${u.name}`,
          unit: u.id,
          values: {
            ...s.values,
            detector: u.detector,
            sam: u.sam,
            denoise: u.denoise,
            confidence: u.confidence,
            dilation: u.dilation,
            cropFactor: u.cropFactor,
            feather: u.feather,
            guideSize: u.guideSize,
            maxSize: Math.max(1024, u.guideSize),
          },
          flags: { ...s.flags, sam: u.sam !== "", segm: u.detector.startsWith("segm/") },
          loras: s.loras,
        };
      });
  }
  if (stage === "controlnet") {
    return settings.controlnet.units
      .filter((u) => u.enabled)
      .map((u: ControlnetUnit) => {
        if (!u.image)
          problems.push({
            code: "no_image",
            unit: u.id,
            message: `ControlNet ${u.name} has no image. Add one, or turn the unit off.`,
          });
        // Status checks run before anything is uploaded; a run needs the uploaded name.
        const image = u.image ? (ctx.images ? ctx.images[u.image.file] : u.image.file) : undefined;
        if (u.image && image === undefined)
          problems.push({
            code: "no_image",
            unit: u.id,
            message: `ControlNet ${u.name}: its image couldn't be sent to ComfyUI. Add it again.`,
          });
        return {
          key: `controlnet-${u.id}`,
          label: `${label} · ${u.name}`,
          unit: u.id,
          values: {
            image,
            preprocessor: u.preprocessor,
            resolution: u.resolution,
            model: u.model,
            strength: u.strength,
            start: u.start,
            end: Math.max(u.start, u.end),
          },
          flags: { preprocess: u.preprocessor !== "" && u.preprocessor !== "none" },
          loras: "",
        };
      });
  }
  return [];
}

/* ── checks ────────────────────────────────────────────────────────────── */

/** "Detector" → "detector", but "ControlNet model" and "SAM model" keep their capitals. */
function lowerFirst(label: string): string {
  const first = label.split(" ")[0] ?? "";
  return /^[A-Z][a-z]*$/.test(first) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function nodeProblems(
  prompt: ApiPrompt,
  added: string[],
  pkg: StagePackage,
  info: ObjectInfo,
  label: string,
): StageProblem | null {
  const missing = [...new Set(added.map((id) => prompt[id]?.class_type ?? ""))].filter(
    (cls) => cls && !info[cls],
  );
  if (!missing.length) return null;
  const packs: NodePack[] = [];
  const core: string[] = [];
  for (const cls of missing) {
    const pack = pkg.packs.find((p) => p.nodes.includes(cls));
    if (pack) {
      const seen = packs.find((p) => p.name === pack.name);
      if (seen) seen.nodes = [...new Set([...seen.nodes, cls])];
      else packs.push({ ...pack, nodes: [cls] });
    } else core.push(cls);
  }
  // Packs in the order the package lists them.
  packs.sort(
    (a, b) =>
      pkg.packs.findIndex((p) => p.name === a.name) - pkg.packs.findIndex((p) => p.name === b.name),
  );
  const parts = packs.map((p) => `${joinNames(p.nodes)} (${p.name})`);
  if (core.length) parts.push(`${joinNames(core)} (built into newer ComfyUI)`);
  const how = packs.length
    ? "Install the missing custom nodes in ComfyUI (Manager → Custom Nodes Manager), then restart ComfyUI."
    : "Update ComfyUI, then restart it.";
  return {
    code: "missing_nodes",
    message: `${label} needs ${joinNames(parts)}. ${how}`,
    packs,
  };
}

function inputOptions(info: ObjectInfo | null, cls: string, input: string): string[] | null {
  if (!info) return null;
  return nodeInputs(info[cls]).find((i) => i.name === input)?.options ?? null;
}

const KIND_FOLDER: Record<string, string> = {
  ultralytics: "ultralytics/bbox or ultralytics/segm",
  sams: "sams",
  controlnet: "controlnet",
  upscale_models: "upscale_models",
};

function modelProblems(
  stage: LoadedStage,
  inst: Instance,
  keptFields: Set<string>,
  info: ObjectInfo,
): StageProblem[] {
  const out: StageProblem[] = [];
  for (const f of stage.pkg.fields) {
    if (!f.modelKind || !keptFields.has(f.field)) continue;
    const value = String(inst.values[f.field] ?? "");
    const cls = stage.graph[f.node]?.class_type ?? "";
    const options = inputOptions(info, cls, f.input);
    if (!options) continue;
    const name = lowerFirst(f.label ?? f.field);
    const folder = KIND_FOLDER[f.modelKind] ?? f.modelKind;
    if (!value)
      out.push({
        code: "pick_model",
        modelKind: f.modelKind,
        ...(inst.unit ? { unit: inst.unit } : {}),
        message: options.length
          ? `${inst.label}: pick a ${name}.`
          : `${inst.label} needs a ${name}, and your ${folder} folder has none. Get one from Models → Manager.`,
      });
    else if (!options.includes(value))
      out.push({
        code: "missing_model",
        modelKind: f.modelKind,
        ...(inst.unit ? { unit: inst.unit } : {}),
        message: `${inst.label}: "${value}" isn't in your ${folder} folder. Pick another ${name} or get it from Models → Manager.`,
      });
  }
  return out;
}

/** Fields whose node made it into the graph (a turned-off SAM isn't checked). */
function keptFields(stage: LoadedStage, inst: Instance): Set<string> {
  const out = new Set<string>();
  for (const f of stage.pkg.fields) {
    const node = stage.graph[f.node];
    const when = node ? blombo(node).when : undefined;
    if (node && (!when || inst.flags[when])) out.add(f.field);
  }
  return out;
}

function choicesFor(stage: LoadedStage | null, info: ObjectInfo | null): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!stage || !info) return out;
  for (const f of stage.pkg.fields) {
    const cls = stage.graph[f.node]?.class_type ?? "";
    const options = inputOptions(info, cls, f.input);
    if (options && f.field !== "image") out[f.field] = options;
  }
  return out;
}

/* ── all stages ────────────────────────────────────────────────────────── */

const RUN_ORDER: StageId[] = ["controlnet", "hires", "adetailer"];

/**
 * Splice the enabled stages (or, with `only`, that one stage whatever its switch says) into
 * `prompt`. Statuses are returned for the stages it looked at; the caller decides whether a
 * problem stops the run.
 */
export function applyStages(
  prompt: ApiPrompt,
  settings: StageSettings,
  packages: LoadedStage[],
  ctx: StageContext,
  only?: StageId,
): StageResult {
  const family = workflowFamily(ctx.bindings);
  const basePorts = findPorts(prompt);
  const ports: PortLinks = { ...basePorts };
  const nextId = idGenerator(prompt);
  const segments: RunSegment[] = [];
  const statuses: StageStatus[] = [];
  const texts: Record<string, string> = {};

  for (const stage of RUN_ORDER) {
    if (only ? only !== stage : !settings[stage as "hires"].enabled) continue;
    const problems: StageProblem[] = [];
    const { found, missing } = pickPackage(packages, stage, family, ports);
    const status: StageStatus = {
      stage,
      package: found?.pkg.id ?? null,
      family,
      problems,
      choices: choicesFor(found, ctx.info),
    };
    statuses.push(status);
    if (!found) {
      problems.push({
        code: "missing_port",
        message: missing.length
          ? `${STAGE_LABELS[stage]} can't attach to this workflow: it has no ${joinNames(missing.map(portName))}.`
          : `There's no ${STAGE_LABELS[stage]} stage package. Reinstall BlomboUI's presets folder.`,
      });
      continue;
    }
    const instances = instancesFor(stage, settings, ctx, found.pkg, problems);
    const addedAll: string[] = [];
    for (const inst of instances) {
      let instPorts = ports;
      if (inst.loras && ctx.loraFiles !== "skip") {
        const loras = lorasIn(inst.loras, ctx.loraFiles);
        if (loras.length && ports.MODEL) {
          const chained = chainLoras(
            prompt,
            ports.MODEL,
            ports.CLIP ?? null,
            loras,
            nextId,
            `${inst.label} · LoRA`,
          );
          instPorts = {
            ...ports,
            MODEL: chained.model,
            ...(chained.clip ? { CLIP: chained.clip } : {}),
          };
        }
      }
      const { added, missing: lacking } = spliceStage(
        prompt,
        found,
        inst,
        instPorts,
        basePorts,
        nextId,
      );
      // Republished ports flow on to the next instance and stage.
      for (const p of found.pkg.provides) if (instPorts[p]) ports[p] = instPorts[p];
      addedAll.push(...added);
      if (lacking.length)
        problems.push({
          code: "missing_port",
          ...(inst.unit ? { unit: inst.unit } : {}),
          message: `${inst.label} needs the workflow's ${joinNames(lacking.map(portName))}, and this workflow has none.`,
        });
      if (ctx.info) problems.push(...modelProblems(found, inst, keptFields(found, inst), ctx.info));
      const g = new GraphView(prompt, null);
      const samplers = added.filter((id) => g.isSampler(id));
      if (samplers.length) segments.push({ id: inst.key, label: inst.label, nodes: samplers });
      if (typeof inst.values.prompt === "string") texts[`${inst.key}.prompt`] = inst.values.prompt;
    }
    if (ctx.info) {
      const nodes = nodeProblems(prompt, addedAll, found.pkg, ctx.info, STAGE_LABELS[stage]);
      if (nodes) problems.unshift(nodes);
    }
  }
  return { segments, statuses, texts };
}

const PORT_NAMES: Record<Port, string> = {
  MODEL: "model",
  CLIP: "text encoder (CLIP)",
  VAE: "VAE",
  POSITIVE: "prompt",
  NEGATIVE: "negative prompt",
  LATENT: "latent",
  IMAGE: "decoded image",
};

function portName(p: Port): string {
  return PORT_NAMES[p];
}

/** The workflow's own sampling passes, before stages ("Sampling", or "Pass 1", "Pass 2"…). */
export function baseSegments(prompt: ApiPrompt): RunSegment[] {
  const g = new GraphView(prompt, null);
  const samplers = g.ids().filter((id) => g.isSampler(id));
  if (samplers.length <= 1) return [{ id: "base", label: "Sampling", nodes: samplers }];
  return samplers.map((id, i) => ({ id: `base-${i + 1}`, label: `Pass ${i + 1}`, nodes: [id] }));
}
