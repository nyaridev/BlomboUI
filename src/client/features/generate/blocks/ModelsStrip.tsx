/**
 * Loaded models, always on top: the workflow's model loaders (checkpoint or diffusion model,
 * VAE, text encoders) plus the LoRAs and wildcards the prompt uses. LoRA tiles are two-way:
 * they come from <lora:…> tags, and moving a strength slider rewrites the tag in the prompt.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useModels, useSettings } from "@client/lib/queries";
import { Badge, FallbackFace, IconButton, Slider, Tooltip } from "@client/ui";
import type { ModelKind } from "@shared/constants";
import { findLoraTags, type LoraTag, removeLoraTag, setLoraStrength } from "@shared/prompt/loras";
import { findWildcards } from "@shared/prompt/wildcards";
import type { Binding } from "@shared/workflow/manifest";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { useModelThumb } from "../../scopes/thumbs";
import { modelDisplayName, modelFolder } from "../labels";
import { useValue } from "../state";
import { useRoleBinding } from "../workflow";

type PickTab = "checkpoints" | "loras" | "wildcards" | "other";

const stem = (f: string) => modelDisplayName(f).toLowerCase();

/** A tile's picture: the scope's or the model's own preview, else the designed fallback. */
function TileFace({ kind, name, fallback }: { kind: ModelKind; name: string; fallback: string }) {
  const { thumb, nsfw } = useModelThumb(kind, name);
  const blur = useSettings().data?.models.blurNsfw ?? true;
  if (thumb && !(nsfw && blur))
    return <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />;
  return (
    <FallbackFace
      name={fallback}
      kind={
        kind === "diffusion_models"
          ? "diffusion_models"
          : kind === "loras"
            ? "loras"
            : "checkpoints"
      }
      className="text-[6px]"
    />
  );
}

function ModelTile({ binding, onClick }: { binding: Binding; onClick: () => void }) {
  const [value] = useValue<string>(binding.id);
  const name = typeof value === "string" && value ? value : "";
  const missing = Boolean(name && binding.options && !binding.options.includes(name));
  const folder = name ? modelFolder(name) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-[68px] w-[260px] shrink-0 items-center gap-3 rounded-lg border border-line bg-surface-2 p-1.5 pr-3 text-left transition-colors hover:border-line-strong focus-ring"
    >
      <div className="h-full w-[46px] shrink-0 overflow-hidden rounded-md">
        <TileFace
          kind={binding.modelKind ?? "checkpoints"}
          name={name}
          fallback={name || binding.label}
        />
      </div>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="label-caps text-[10px]">{binding.label}</span>
        <span className="truncate text-sm font-medium text-fg" title={name}>
          {name ? modelDisplayName(name) : "Pick a model"}
        </span>
        <span className="flex gap-1">
          {missing ? (
            <Badge tone="warning">
              <Icon name="info" size={11} /> not found
            </Badge>
          ) : folder ? (
            <Badge>{folder}</Badge>
          ) : null}
        </span>
      </span>
      <Icon name="chevrons-up-down" size={14} className="text-fg-3 group-hover:text-fg" />
    </button>
  );
}

function SmallModelTile({
  binding,
  onClick,
  icon,
}: {
  binding: Binding;
  onClick: () => void;
  icon: "wave" | "text";
}) {
  const [value] = useValue<string>(binding.id);
  const name = typeof value === "string" ? value : "";
  const missing = Boolean(name && binding.options && !binding.options.includes(name));
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[68px] w-[170px] shrink-0 flex-col justify-center gap-0.5 rounded-lg border border-line bg-surface-2 px-3 text-left transition-colors hover:border-line-strong focus-ring"
    >
      <span className="label-caps flex items-center gap-1.5 text-[10px]">
        <Icon name={icon} size={12} /> {binding.label}
      </span>
      <span className={cn("truncate text-sm", missing ? "text-warning" : "text-fg-2")} title={name}>
        {name ? modelDisplayName(name) : "—"}
      </span>
    </button>
  );
}

export function ModelsStrip({ onPick }: { onPick: (tab: PickTab) => void }) {
  const checkpoint = useRoleBinding("model.checkpoint");
  const unet = useRoleBinding("model.unet");
  const vae = useRoleBinding("model.vae");
  const clip = useRoleBinding("model.clip");
  const clip2 = useRoleBinding("model.clip2");
  const positive = useRoleBinding("prompt.positive");
  const [prompt, setPrompt] = useValue<string>(positive?.id ?? "prompt.positive");
  const text = typeof prompt === "string" ? prompt : "";
  const loras = useMemo(() => findLoraTags(text), [text]);
  const wildcards = useMemo(() => findWildcards(text), [text]);
  const loraFiles = useModels(loras.length ? "loras" : null).data?.names;
  const main = checkpoint ?? unet;

  return (
    <div className="scroll-quiet flex items-stretch gap-2 overflow-x-auto pb-0.5">
      {main ? <ModelTile binding={main} onClick={() => onPick("checkpoints")} /> : null}
      {vae ? (
        <SmallModelTile binding={vae} icon="wave" onClick={() => onPick("other")} />
      ) : checkpoint ? (
        <div className="flex h-[68px] w-[150px] shrink-0 flex-col justify-center gap-0.5 rounded-lg border border-line bg-surface-2 px-3">
          <span className="label-caps flex items-center gap-1.5 text-[10px]">
            <Icon name="wave" size={12} /> VAE
          </span>
          <span className="truncate text-sm text-fg-3">From checkpoint</span>
        </div>
      ) : null}
      {clip ? <SmallModelTile binding={clip} icon="text" onClick={() => onPick("other")} /> : null}
      {clip2 ? (
        <SmallModelTile binding={clip2} icon="text" onClick={() => onPick("other")} />
      ) : null}

      {main || vae || clip ? <span className="mx-1 w-px shrink-0 self-stretch bg-line" /> : null}

      <AnimatePresence initial={false}>
        {loras.map((tag) => (
          <LoraTile
            key={tag.name}
            tag={tag}
            missing={Boolean(loraFiles && !loraFiles.some((f) => stem(f) === stem(tag.name)))}
            onStrength={(v) => setPrompt(setLoraStrength(text, tag, v))}
            onRemove={() => setPrompt(removeLoraTag(text, tag))}
          />
        ))}
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

      {positive ? (
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
      ) : null}
    </div>
  );
}

function LoraTile({
  tag,
  missing,
  onStrength,
  onRemove,
}: {
  tag: LoraTag;
  missing: boolean;
  onStrength: (v: number) => void;
  onRemove: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "group relative flex h-[68px] w-[236px] shrink-0 items-center gap-2.5 rounded-lg border bg-surface-2 p-1.5 pr-3",
        missing ? "border-yellow/45" : "border-purple/35",
      )}
    >
      <div className="h-full w-[46px] shrink-0 overflow-hidden rounded-md">
        <TileFace kind="loras" name={tag.name} fallback={tag.name} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5 pr-5">
          <span className="truncate text-sm font-medium text-fg" title={tag.name}>
            {modelDisplayName(tag.name)}
          </span>
          {missing ? (
            <Tooltip content="Not in your loras folder: generating will stop with an error">
              <span className="text-warning">
                <Icon name="info" size={13} />
              </span>
            </Tooltip>
          ) : null}
        </span>
        <Slider
          value={tag.strength}
          onChange={onStrength}
          min={-1}
          max={2}
          step={0.05}
          size="sm"
          label=""
          defaultValue={1}
        />
      </div>
      <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <IconButton icon="x" label={`Remove ${tag.name}`} size="xs" onClick={onRemove} />
      </div>
    </motion.div>
  );
}
