/**
 * What a .safetensors header says: what kind of model it is, how it was trained (a grid of
 * facts beside the most frequent training tags), trigger words, dataset folders and all the
 * metadata with a filter.
 */
import { Icon } from "@client/icons/Icon";
import { Badge, Chip, CopyButton, Panel, PropertyList, TextField, toast } from "@client/ui";
import type { SafetensorsInfo } from "@shared/safetensors";
import { useState } from "react";
import { Facts, Section } from "./parts";

const GUESS: Record<SafetensorsInfo["guess"], string> = {
  lora: "LoRA",
  checkpoint: "Checkpoint",
  diffusion: "Diffusion model",
  vae: "VAE",
  "text-encoder": "Text encoder",
  embedding: "Embedding",
  other: "Model",
};

function formatParams(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
  return String(n);
}

const copy = (text: string) =>
  void navigator.clipboard?.writeText(text).then(() => toast(`Copied "${text}"`, "success"));

export function SafetensorsSections({ st }: { st: SafetensorsInfo }) {
  const t = st.training;
  const [metaFilter, setMetaFilter] = useState("");
  const meta = Object.entries(st.metadata).filter(
    ([k, v]) => !metaFilter || `${k} ${v}`.toLowerCase().includes(metaFilter.toLowerCase()),
  );
  return (
    <>
      <div className="flex items-start gap-4 max-lg:flex-col">
        <Panel className="flex min-w-0 flex-1 flex-col gap-4 p-5 max-lg:w-full">
          <div className="flex items-center gap-2">
            <Icon name="models" size={16} className="text-accent-ink" />
            <span className="min-w-0 truncate text-sm font-medium text-fg">
              {t.title ?? "From the file's header"}
            </span>
            <Badge tone="accent">{GUESS[st.guess]}</Badge>
          </div>
          <Facts
            columns={3}
            items={[
              { label: "Base model", value: t.baseModel },
              { label: "Network", value: t.network },
              {
                label: "Rank / alpha",
                value: t.dim || t.alpha ? `${t.dim ?? "—"} / ${t.alpha ?? "—"}` : null,
              },
              { label: "Epochs", value: t.epochs },
              { label: "Steps", value: t.steps },
              { label: "Resolution", value: t.resolution },
              { label: "Learning rate", value: t.learningRate },
              { label: "Optimizer", value: t.optimizer },
              { label: "Training images", value: t.images },
              { label: "Tensors", value: st.tensors.toLocaleString() },
              { label: "Parameters", value: formatParams(st.parameters) },
              {
                label: "Precision",
                value: Object.entries(st.dtypes)
                  .sort((a, b) => b[1] - a[1])
                  .map(([d, n]) => `${d} (${n})`)
                  .join(", "),
              },
            ]}
          />
          {t.triggerWords.length ? (
            <div className="flex flex-col gap-1.5">
              <span className="label-caps">Trigger words in the file</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {t.triggerWords.map((w) => (
                  <Chip key={w} size="sm" onClick={() => copy(w)}>
                    {w}
                  </Chip>
                ))}
                <CopyButton text={t.triggerWords.join(", ")} label="Copy all trigger words" />
              </div>
            </div>
          ) : null}
          {t.datasets.length ? (
            <div className="flex flex-col gap-1.5">
              <span className="label-caps">Dataset folders</span>
              {t.datasets.map((d) => (
                <div key={d.name} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 truncate font-mono text-xs text-fg-2">{d.name}</span>
                  <span className="text-xs text-fg-3 tabular">
                    {d.images} images × {d.repeats} repeats
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>

        {t.tags.length ? (
          <Panel className="flex w-80 shrink-0 flex-col max-lg:w-full">
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <span className="label-caps">Frequent tags</span>
              <Badge>{t.tags.length.toLocaleString()}</Badge>
              <CopyButton
                text={t.tags
                  .slice(0, 20)
                  .map(([tag]) => tag)
                  .join(", ")}
                label="Copy the top 20 tags"
                className="ml-auto"
              />
            </div>
            <div className="scroll-quiet max-h-[26rem] overflow-y-auto px-2 pb-2">
              {t.tags.map(([tag, n]) => (
                <button
                  key={tag}
                  type="button"
                  title={`Copy "${tag}"`}
                  onClick={() => copy(tag)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-left text-sm text-fg-2 hover:bg-field hover:text-fg focus-ring"
                >
                  <span className="min-w-0 flex-1 break-all">{tag}</span>
                  <span className="font-mono text-xs text-fg-3 tabular">{n}</span>
                </button>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>

      {Object.keys(st.metadata).length ? (
        <Section
          title="All metadata"
          icon="file-text"
          count={Object.keys(st.metadata).length}
          defaultOpen={false}
        >
          <TextField
            size="sm"
            icon="search"
            placeholder="Filter keys and values"
            value={metaFilter}
            onChange={(e) => setMetaFilter(e.target.value)}
            onClear={() => setMetaFilter("")}
            className="mb-3 w-72"
          />
          <PropertyList
            labelWidth={220}
            items={meta.map(([k, v]) => ({
              label: k,
              value: v.length > 600 ? `${v.slice(0, 600)}…` : v,
              copy: v,
              mono: true,
            }))}
          />
        </Section>
      ) : (
        <p className="text-sm text-fg-3">This file has no metadata besides its tensors.</p>
      )}
    </>
  );
}
