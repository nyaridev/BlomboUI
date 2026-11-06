/**
 * The Saved data view's image section: pick a gallery image and read what it carries in words.
 * Blombo's record (workflow, seed, every model with its hash and Civitai ids, the prompts as they
 * ran, the values), ComfyUI's graph as a list of nodes, the Civitai details beside an added image,
 * and what the gallery made of it. Each entry's raw text stays one click away.
 */
import { Icon } from "@client/icons/Icon";
import { useDevImage, useGalleryImages } from "@client/lib/queries";
import {
  Badge,
  Collapsible,
  CopyButton,
  EmptyState,
  KIND_STYLE,
  Panel,
  PropertyList,
  Select,
  Skeleton,
} from "@client/ui";
import type { DevChunk, DevImageMeta } from "@shared/dev";
import { BlomboImageMeta, ImageSummary, type ModelUse } from "@shared/imageinfo";
import { ApiPrompt, isApiLink } from "@shared/workflow/graph";
import { useState } from "react";
import { Code, GroupHeading, Section, shortValue } from "./parts";

/** What each metadata entry is, in words. */
const ENTRIES: Record<string, string> = {
  prompt: "ComfyUI's graph: every node and setting as it ran",
  workflow: "ComfyUI's canvas (what ComfyUI's Load and Import workflow read)",
  blombo: "Blombo's own record",
  parameters: "A1111 / Forge settings text (from those apps)",
};

export function ImageSection() {
  const list = useGalleryImages({});
  const images = list.data?.pages[0]?.items.slice(0, 80) ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const id = picked ?? images[0]?.id ?? null;
  const meta = useDevImage(id);
  return (
    <Section
      id="image"
      title="What an image carries"
      text="Every image Blombo makes has ComfyUI's graph and canvas in it, plus Blombo's own record: the workflow, seed, values, the prompts as they ran and each model with its hash. Pick one to read it."
    >
      {images.length ? (
        <Select
          label="Image"
          value={id === null ? null : String(id)}
          onChange={(v) => setPicked(Number(v))}
          options={images.map((i) => ({ value: String(i.id), label: i.path }))}
          className="max-w-[560px]"
        />
      ) : null}
      {!images.length ? (
        list.isLoading ? (
          <Skeleton className="h-10 w-80" />
        ) : (
          <EmptyState
            icon="gallery"
            title="No images in the gallery yet"
            text="Generate or add one to see what it carries."
          />
        )
      ) : meta.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : meta.error ? (
        <p className="text-sm text-danger">{meta.error.message}</p>
      ) : meta.data ? (
        <ImageReport meta={meta.data} />
      ) : null}
    </Section>
  );
}

function ImageReport({ meta: m }: { meta: DevImageMeta }) {
  const chunk = (key: string) => m.chunks.find((c) => c.key === key);
  const blombo = BlomboImageMeta.safeParse(chunk("blombo")?.json);
  const graph = ApiPrompt.safeParse(chunk("prompt")?.json);
  const summary = ImageSummary.safeParse(m.index.summary);
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-xs text-fg-3">
        <Icon name="file" size={13} className="shrink-0" />
        <span className="font-mono break-all">{m.file}</span>
        <Badge>{m.format.toUpperCase()}</Badge>
      </p>

      {blombo.success ? (
        <BlomboRecord record={blombo.data} />
      ) : (
        <Panel className="p-4 text-sm text-fg-3">
          No Blombo record in this file (it wasn't made by Blombo, or before it wrote one).
        </Panel>
      )}

      {graph.success ? <GraphNodes graph={graph.data} /> : null}

      {m.sidecar ? <SidecarPanel sidecar={m.sidecar as Record<string, unknown>} /> : null}

      {summary.success ? (
        <Panel className="flex flex-col gap-3 p-4">
          <GroupHeading
            icon="gallery"
            title="What the gallery made of it"
            text="Read from the file when it was indexed; this is what the lightbox shows and search looks through."
          />
          <PropertyList
            labelWidth={132}
            items={[
              { label: "Read from", value: summary.data.source },
              {
                label: "Prompt",
                value: summary.data.prompt ? shortValue(summary.data.prompt, 160) : null,
              },
              { label: "Model", value: summary.data.model },
              {
                label: "LoRAs",
                value: summary.data.loras.map((l) => l.name).join(", ") || null,
              },
              {
                label: "Hashes known",
                value: Object.keys(summary.data.hashes).length
                  ? Object.keys(summary.data.hashes).join(", ")
                  : "None",
              },
              {
                label: "Civitai links",
                value: Object.keys(summary.data.civitai).length
                  ? Object.keys(summary.data.civitai).join(", ")
                  : "None",
              },
            ]}
          />
        </Panel>
      ) : null}

      <Collapsible
        title="Raw entries"
        subtitle={`${m.chunks.length} in the file, exactly as written`}
        icon="text"
      >
        <div className="flex flex-col gap-2">
          {m.chunks.length ? (
            m.chunks.map((c) => <RawEntry key={c.key} chunk={c} />)
          ) : (
            <p className="text-sm text-fg-3">This file has no metadata entries.</p>
          )}
        </div>
      </Collapsible>
    </div>
  );
}

function BlomboRecord({ record: r }: { record: BlomboImageMeta }) {
  const values = Object.entries(r.values);
  return (
    <Panel className="flex flex-col gap-4 p-4">
      <GroupHeading
        icon="data"
        title="Blombo's record"
        text="Written into the image when it was made."
      />
      <PropertyList
        labelWidth={132}
        items={[
          {
            label: "Workflow",
            value: r.name ? `${r.name}${r.workflow ? ` (${r.workflow})` : ""}` : r.workflow,
          },
          {
            label: "Seed",
            value: r.seed,
            mono: true,
            copy: r.seed !== null ? String(r.seed) : undefined,
          },
        ]}
      />

      <div className="flex flex-col gap-2">
        <span className="label-caps">Models</span>
        {r.models.length ? (
          <ModelTable models={r.models} />
        ) : (
          <p className="text-sm text-fg-3">
            Not recorded: the image was made before Blombo saved models with their hashes.
          </p>
        )}
      </div>

      {Object.keys(r.prompts).length ? (
        <div className="flex flex-col gap-2">
          <span className="label-caps">Prompts as they ran</span>
          {Object.entries(r.prompts).map(([role, text]) => (
            <div key={role} className="flex flex-col gap-1">
              <span className="text-xs text-fg-3">{roleLabel(role)}</span>
              <p className="rounded-md border border-line bg-sunken px-3 py-2 text-sm break-words text-fg-2">
                {text || <span className="text-fg-4">empty</span>}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {values.length ? (
        <Collapsible
          title="Values as you set them"
          subtitle={`${values.length} parameters`}
          tone="inset"
        >
          <PropertyList
            labelWidth={180}
            items={values.map(([k, v]) => ({
              label: roleLabel(k),
              value: shortValue(v, 120),
              mono: typeof v !== "string",
            }))}
          />
        </Collapsible>
      ) : null}
    </Panel>
  );
}

function ModelTable({ models }: { models: ModelUse[] }) {
  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y divide-line">
        {models.map((m) => {
          const style = KIND_STYLE[m.kind];
          return (
            <li key={`${m.kind}:${m.name}:${m.strength}`} className="flex items-start gap-3 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-2 text-fg-3">
                <Icon name={style?.icon ?? "models"} size={15} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-baseline gap-x-2 text-xs text-fg-3">
                  <span className="text-fg-2">{style?.label ?? m.kind}</span>
                  {m.strength !== null ? (
                    <span className="tabular">strength {m.strength}</span>
                  ) : null}
                  {m.civitai ? (
                    <span className="font-mono">
                      Civitai {m.civitai.modelId} @ {m.civitai.versionId}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-xs break-all text-fg">{m.name}</span>
                {m.sha256 ? (
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-mono text-2xs text-fg-3" title={m.sha256}>
                      SHA256 {m.sha256}
                    </span>
                    <CopyButton text={m.sha256} label="Copy hash" size="xs" />
                  </span>
                ) : (
                  <span className="text-2xs text-fg-4">No hash</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-fg-3">
        No hash: the file wasn't in your models folder when it ran, or it hadn't been hashed yet
        (that happens after the run, so the next image has it).
      </p>
    </div>
  );
}

function GraphNodes({ graph }: { graph: ApiPrompt }) {
  const nodes = Object.entries(graph).sort(
    ([a], [b]) => Number(a) - Number(b) || a.localeCompare(b),
  );
  return (
    <Collapsible
      title="ComfyUI's graph"
      subtitle={`${nodes.length} nodes, each with its settings as they ran`}
      icon="workflow"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-fg-4">
              <th className="pb-1.5 font-normal">Node</th>
              <th className="pb-1.5 font-normal">Kind</th>
              <th className="pb-1.5 font-normal">Settings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {nodes.map(([nodeId, node]) => {
              const settings = Object.entries(node.inputs ?? {}).filter(([, v]) => !isApiLink(v));
              return (
                <tr key={nodeId}>
                  <td className="py-1.5 pr-3 align-top whitespace-nowrap text-fg">
                    <span className="mr-1.5 font-mono text-fg-4">#{nodeId}</span>
                    {node._meta?.title?.trim() || node.class_type}
                  </td>
                  <td className="py-1.5 pr-3 align-top font-mono text-fg-3">{node.class_type}</td>
                  <td className="py-1.5 align-top break-all text-fg-2">
                    {settings.length
                      ? settings.map(([k, v]) => `${k}: ${shortValue(v, 60)}`).join(" · ")
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Collapsible>
  );
}

function SidecarPanel({ sidecar: s }: { sidecar: Record<string, unknown> }) {
  const names = (s.names ?? {}) as Record<string, string>;
  const versions = Array.isArray(s.versions) ? (s.versions as number[]) : [];
  return (
    <Panel className="flex flex-col gap-3 p-4">
      <GroupHeading
        icon="globe"
        title="Civitai details"
        text="Saved beside the image when it was added from Civitai (its .civitai.json)."
      />
      <PropertyList
        labelWidth={132}
        items={[
          { label: "Posted by", value: typeof s.by === "string" ? s.by : null },
          { label: "Site", value: typeof s.site === "string" ? s.site : null },
          {
            label: "Image id",
            value: typeof s.imageId === "number" ? s.imageId : null,
            mono: true,
          },
          {
            label: "Made with",
            value: versions.length
              ? versions.map((v) => names[String(v)] ?? `version ${v}`).join(", ")
              : null,
          },
        ]}
      />
    </Panel>
  );
}

function RawEntry({ chunk: c }: { chunk: DevChunk }) {
  const text = c.json !== null ? JSON.stringify(c.json, null, 2) : c.text;
  return (
    <Collapsible
      title={<span className="font-mono">{c.key}</span>}
      subtitle={`${ENTRIES[c.key] ?? "Metadata entry"} · ${c.length.toLocaleString()} characters`}
      tone="inset"
    >
      <Code text={text} label={c.key} />
    </Collapsible>
  );
}

const ROLE_LABELS: Record<string, string> = {
  "prompt.positive": "Positive prompt",
  "prompt.negative": "Negative prompt",
};

/** A binding id in words: known roles by name, others with dots and underscores as spaces. */
function roleLabel(role: string): string {
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  const words = role.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
