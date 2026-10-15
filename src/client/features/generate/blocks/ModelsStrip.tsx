/**
 * Loaded models, always on top: checkpoint, VAE, LoRAs and wildcards that the prompt uses.
 * LoRA tiles are two-way: they come from <lora:…> tags, and moving a strength slider rewrites
 * the tag in the prompt.
 */
import { MOCK_CHECKPOINTS, MOCK_LORAS } from "@client/features/preview/mock";
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { Art, Badge, FallbackFace, IconButton, Slider, Tooltip } from "@client/ui";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { useValues } from "../state";

const LORA_TAG = /<lora:([^:>]+)(?::([^:>]*))?(:[^>]*)?>/gi;
const WILDCARD = /__([^\s_][^\s]*?)__/g;

interface LoraHit {
  name: string;
  strength: number;
  start: number;
  end: number;
  extra: string;
}

function parseLoras(prompt: string): LoraHit[] {
  const out: LoraHit[] = [];
  for (const m of prompt.matchAll(LORA_TAG)) {
    const strength = m[2] === undefined ? 1 : Number(m[2]);
    if (!m[1] || !Number.isFinite(strength)) continue;
    out.push({
      name: m[1],
      strength,
      start: m.index,
      end: m.index + m[0].length,
      extra: m[3] ?? "",
    });
  }
  return out;
}

export function ModelsStrip({
  onPick,
}: {
  onPick: (tab: "checkpoints" | "loras" | "wildcards" | "other") => void;
}) {
  const prompt = useValues((s) => s.prompt);
  const setPrompt = useValues((s) => s.setPrompt);
  const loras = useMemo(() => parseLoras(prompt), [prompt]);
  const wildcards = useMemo(
    () => [...new Set([...prompt.matchAll(WILDCARD)].map((m) => m[1] as string))],
    [prompt],
  );
  const ckpt = MOCK_CHECKPOINTS[0];

  const setStrength = (hit: LoraHit, value: number) => {
    const tag = `<lora:${hit.name}:${value.toFixed(2).replace(/0$/, "")}${hit.extra}>`;
    setPrompt(prompt.slice(0, hit.start) + tag + prompt.slice(hit.end));
  };
  const removeLora = (hit: LoraHit) => {
    const before = prompt.slice(0, hit.start).replace(/,\s*$/, "");
    setPrompt(before + prompt.slice(hit.end));
  };

  return (
    <div className="scroll-quiet flex items-stretch gap-2 overflow-x-auto pb-0.5">
      <button
        type="button"
        onClick={() => onPick("checkpoints")}
        className="group flex h-[68px] w-[260px] shrink-0 items-center gap-3 rounded-lg border border-line bg-surface-2 p-1.5 pr-3 text-left transition-colors hover:border-line-strong focus-ring"
      >
        <Art seed="wai14" className="h-full w-[46px] shrink-0 rounded-md" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="label-caps text-[10px]">Checkpoint</span>
          <span className="truncate text-sm font-medium text-fg">{ckpt?.name}</span>
          <span className="flex gap-1">
            <Badge tone="accent">IL</Badge>
            <Badge>fp16</Badge>
          </span>
        </span>
        <Icon name="chevrons-up-down" size={14} className="text-fg-3 group-hover:text-fg" />
      </button>

      <button
        type="button"
        onClick={() => onPick("other")}
        className="flex h-[68px] w-[150px] shrink-0 flex-col justify-center gap-0.5 rounded-lg border border-line bg-surface-2 px-3 text-left transition-colors hover:border-line-strong focus-ring"
      >
        <span className="label-caps flex items-center gap-1.5 text-[10px]">
          <Icon name="wave" size={12} /> VAE
        </span>
        <span className="truncate text-sm text-fg-2">From checkpoint</span>
      </button>

      <span className="mx-1 w-px shrink-0 self-stretch bg-line" />

      <AnimatePresence initial={false}>
        {loras.map((hit) => {
          const mock = MOCK_LORAS.find((l) => l.name === hit.name);
          return (
            <motion.div
              key={`${hit.name}`}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="group relative flex h-[68px] w-[236px] shrink-0 items-center gap-2.5 rounded-lg border border-purple/35 bg-surface-2 p-1.5 pr-3"
            >
              <div className="h-full w-[46px] shrink-0 overflow-hidden rounded-md">
                {mock?.thumb?.startsWith("art:") ? (
                  <Art seed={mock.thumb.slice(4)} className="h-full w-full" />
                ) : (
                  <FallbackFace name={hit.name} kind="loras" className="text-[6px]" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate pr-5 text-sm font-medium text-fg">{hit.name}</span>
                <Slider
                  value={hit.strength}
                  onChange={(v) => setStrength(hit, v)}
                  min={-1}
                  max={2}
                  step={0.05}
                  size="sm"
                  label=""
                  defaultValue={1}
                />
              </div>
              <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100">
                <IconButton
                  icon="x"
                  label={`Remove ${hit.name}`}
                  size="xs"
                  onClick={() => removeLora(hit)}
                />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {wildcards.map((w) => (
        <Tooltip key={w} content="Wildcard: a random line each run">
          <div className="flex h-[68px] w-[170px] shrink-0 flex-col justify-center gap-1 rounded-lg border border-cyan/35 bg-surface-2 px-3">
            <span className="label-caps flex items-center gap-1.5 text-[10px] text-cyan-ink">
              <Icon name="wildcards" size={12} /> Wildcard
            </span>
            <span className="truncate font-mono text-xs text-fg">{w}</span>
          </div>
        </Tooltip>
      ))}

      <button
        type="button"
        onClick={() => onPick("loras")}
        className={cn(
          "flex h-[68px] w-[110px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-xs text-fg-3 transition-colors",
          "hover:border-accent/60 hover:text-fg focus-ring",
        )}
      >
        <Icon name="plus" size={18} />
        Add LoRA
      </button>
    </div>
  );
}
