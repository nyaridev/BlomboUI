/**
 * Base models grouped by family (Wan, Qwen, Flux, SDXL…), the most used first, for the pickers'
 * base model filter and the Civitai browser's (which lists what Civitai offers now and sorts it
 * in here). Names are Civitai's; a name not listed joins the family its `match` fits (a new
 * "Wan Video 3.1" goes with Wan). Local models carry shortBaseModel()'s labels ("IL", "SD1.5",
 * or a name cut to 10 characters), which are matched too. Anything else is "Other".
 */

export const BASE_MODEL_GROUPS: ReadonlyArray<{
  title: string;
  names: readonly string[];
  match?: RegExp;
}> = [
  { title: "Illustrious and NoobAI", names: ["Illustrious", "NoobAI"] },
  { title: "Pony", names: ["Pony", "Pony V7"], match: /^pony\b/i },
  { title: "SDXL", names: ["SDXL 1.0", "SDXL Lightning", "SDXL Hyper"], match: /^sdxl\b/i },
  {
    title: "SD 1 and 2",
    names: ["SD 1.4", "SD 1.5", "SD 1.5 LCM", "SD 1.5 Hyper", "SD 2.0", "SD 2.1"],
    match: /^sd [12]\./i,
  },
  { title: "SD 3", names: ["SD 3", "SD 3.5"], match: /^sd 3\b/i },
  {
    title: "Flux",
    match: /^flux\b/i,
    names: [
      "Flux.1 S",
      "Flux.1 D",
      "Flux.1 Krea",
      "Flux.1 Kontext",
      "Flux.2 D",
      "Flux.2 Klein 9B",
      "Flux.2 Klein 9B-base",
      "Flux.2 Klein 4B",
      "Flux.2 Klein 4B-base",
      "Flux.3",
      "Flux.3 Klein",
      "Flux.3 Klein-base",
      "Flux 3 Video",
    ],
  },
  { title: "Qwen", names: ["Qwen", "Qwen 2", "Qwen 2.1", "Qwen 3"], match: /^qwen\b/i },
  {
    title: "Wan",
    match: /^wan\b/i,
    names: [
      "Wan Video 1.3B t2v",
      "Wan Video 14B t2v",
      "Wan Video 14B i2v 480p",
      "Wan Video 14B i2v 720p",
      "Wan Video 2.2 TI2V-5B",
      "Wan Video 2.2 I2V-A14B",
      "Wan Video 2.2 T2V-A14B",
      "Wan Video 2.5 T2V",
      "Wan Video 2.5 I2V",
      "Wan Image 2.7",
      "Wan Video 2.7",
      "Wan Video 3.0",
    ],
  },
  { title: "Z-Image", names: ["ZImageTurbo", "ZImageBase"], match: /^zimage/i },
  { title: "Chroma", names: ["Chroma"], match: /^chroma\b/i },
  { title: "HiDream", names: ["HiDream", "HiDream-O1"], match: /^hidream\b/i },
  { title: "Hunyuan", names: ["Hunyuan 1", "Hunyuan Video"], match: /^hunyuan\b/i },
  { title: "LTX Video", names: ["LTXV", "LTXV2", "LTXV 2.3", "LTXV 2.5"], match: /^ltxv/i },
  {
    title: "More image models",
    names: [
      "Anima",
      "AuraFlow",
      "Boogu",
      "Ernie",
      "Grok",
      "HappyHorse",
      "Ideogram 4.0",
      "Kolors",
      "Krea 2",
      "Krea 2 Turbo",
      "Lens",
      "Lumina",
      "MageFlow",
      "MAI",
      "Ming Image Design 0.1",
      "Ming Image Design Layer 0.1",
      "MOSS Image",
      "Muse Image",
      "PixArt a",
      "PixArt E",
      "Reve",
      "Upscaler",
    ],
  },
  { title: "More video models", names: ["CogVideoX", "Mochi", "MiniMax H3"] },
  { title: "Audio", names: ["ACE Audio", "MiniMax Music 3", "Sonilo"] },
];

/** Every listed name, then Civitai's own "Other": the Civitai filter's list when it can't ask. */
export const KNOWN_BASE_MODELS: readonly string[] = [
  ...BASE_MODEL_GROUPS.flatMap((g) => g.names),
  "Other",
];

/** shortBaseModel()'s labels: the listed name they sort with, and how they read. */
const SHORT: Record<string, { like: string; label: string }> = {
  il: { like: "Illustrious", label: "Illustrious" },
  sdxl: { like: "SDXL 1.0", label: "SDXL" },
  "sd1.5": { like: "SD 1.5", label: "SD 1.5" },
  sd3: { like: "SD 3", label: "SD 3" },
  flux: { like: "Flux.1 D", label: "Flux" },
};

/**
 * The base models given (as saved), sorted by group in listed order and labeled; unknown ones
 * last, under "Other".
 */
export function groupBaseModels(
  names: readonly string[],
): Array<{ name: string; label: string; group: string }> {
  const order = new Map<string, { name: string; group: string; at: number }>();
  // A family's own names first, then the ones its pattern takes in (after them, by name).
  const families: Array<{ match: RegExp; group: string; at: number }> = [];
  let at = 0;
  for (const g of BASE_MODEL_GROUPS) {
    for (const n of g.names) order.set(n.toLowerCase(), { name: n, group: g.title, at: at++ });
    if (g.match) families.push({ match: g.match, group: g.title, at: at - 0.5 });
  }
  const find = (name: string) => {
    const low = name.toLowerCase();
    const short = SHORT[low];
    if (short) {
      const known = order.get(short.like.toLowerCase());
      return known && { ...known, name: short.label };
    }
    if (order.has(low)) return order.get(low);
    if (name.length === 10)
      for (const [key, v] of order)
        if (key.startsWith(low)) return { ...v, name: `${name.trim()}…` };
    if (name.length === 10) for (const [key, v] of order) if (key.startsWith(low)) return v;
    const family = families.find((f) => f.match.test(name.trim()));
    if (family) return { name: name.trim(), group: family.group, at: family.at };
    return undefined;
  };
  return [...new Set(names)]
    .map((name) => {
      const known = find(name);
      return {
        name,
        label: known?.name ?? name,
        group: known?.group ?? "Other",
        at: known?.at ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.at - b.at || a.label.localeCompare(b.label))
    .map(({ name, label, group }) => ({ name, label, group }));
}
