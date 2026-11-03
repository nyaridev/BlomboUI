/**
 * Base models grouped by who makes them (the old app's model types), for the pickers' base
 * model filter. Names are Civitai's; local models carry shortBaseModel()'s labels ("IL",
 * "SD1.5", or a name cut to 10 characters), which are matched too. Anything else is "Other".
 */

export const BASE_MODEL_GROUPS: ReadonlyArray<{ title: string; names: readonly string[] }> = [
  { title: "Anima", names: ["Anima"] },
  { title: "AuraFlow", names: ["AuraFlow"] },
  { title: "Chroma", names: ["Chroma"] },
  { title: "CogVideoX", names: ["CogVideoX"] },
  { title: "Baidu", names: ["Ernie"] },
  {
    title: "Black Forest Labs",
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
      "Flux 3 Video",
    ],
  },
  { title: "xAI", names: ["Grok"] },
  { title: "Alibaba - Taotian", names: ["HappyHorse"] },
  { title: "HiDream", names: ["HiDream", "HiDream-O1"] },
  { title: "Tencent", names: ["Hunyuan 1", "Hunyuan Video"] },
  { title: "Ideogram", names: ["Ideogram 4.0"] },
  { title: "Boogu", names: ["Boogu"] },
  { title: "SDXL Community", names: ["Illustrious", "NoobAI"] },
  { title: "Kolors", names: ["Kolors"] },
  { title: "Krea AI", names: ["Krea 2"] },
  { title: "Lightricks", names: ["LTXV", "LTXV2", "LTXV 2.3", "LTXV 2.5"] },
  { title: "Lens", names: ["Lens"] },
  { title: "Lumina", names: ["Lumina"] },
  { title: "Microsoft", names: ["MageFlow", "MAI"] },
  { title: "Mochi", names: ["Mochi"] },
  { title: "PixArt", names: ["PixArt a", "PixArt E"] },
  { title: "Pony Diffusion", names: ["Pony", "Pony V7"] },
  {
    title: "Alibaba",
    names: [
      "Qwen",
      "Qwen 2",
      "Qwen 3",
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
    ],
  },
  {
    title: "Stability AI",
    names: [
      "SD 1.4",
      "SD 1.5",
      "SD 1.5 LCM",
      "SD 1.5 Hyper",
      "SD 2.0",
      "SD 2.1",
      "SD 3",
      "SD 3.5",
      "SDXL 1.0",
      "SDXL Lightning",
      "SDXL Hyper",
    ],
  },
  { title: "Reve AI", names: ["Reve"] },
  { title: "Alibaba - Tongyi Lab", names: ["ZImageTurbo", "ZImageBase"] },
  { title: "Hailuo H3 by MiniMax", names: ["MiniMax H3"] },
  { title: "ACE Audio", names: ["ACE Audio"] },
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
  let at = 0;
  for (const g of BASE_MODEL_GROUPS)
    for (const n of g.names) order.set(n.toLowerCase(), { name: n, group: g.title, at: at++ });
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
