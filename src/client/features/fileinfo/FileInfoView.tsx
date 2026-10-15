/**
 * File Info: drop or pick a file and read what's inside, in sections. Images show how they
 * were made (Blombo, ComfyUI or A1111 metadata), the embedded graph and every text chunk, with
 * "Use these settings" and "Import as workflow". Safetensors files show their header: training
 * details, trigger words, the tag cloud and raw metadata. Files picked in the gallery or the
 * Models view open here too. Nothing is modified.
 *
 * A dropped .safetensors file never uploads whole: only its header bytes are read and sent.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { formatBytes } from "@client/lib/number";
import { useImportWorkflow } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  Badge,
  Button,
  Chip,
  Collapsible,
  CopyButton,
  DropZone,
  EmptyState,
  Panel,
  PropertyList,
  SectionTitle,
  Skeleton,
  TextField,
  toast,
} from "@client/ui";
import type { FileInfo, ImageFileInfo } from "@shared/fileinfo";
import { headerLength, MAX_HEADER_BYTES, type SafetensorsInfo } from "@shared/safetensors";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { applyImageSettings } from "../generate/applySettings";
import { useActiveChoice } from "../generate/workflow";
import { useFileInfoTarget } from "./state";

const ACCEPT = ".png,.webp,.jpg,.jpeg,.safetensors,.sft,image/png,image/webp,image/jpeg";
const MAX_IMAGE_UPLOAD = 200 * 1024 * 1024;

/** Read a dropped file into FileInfo, sending only what the server needs. */
async function inspectFile(file: File): Promise<FileInfo> {
  if (/\.(safetensors|sft)$/i.test(file.name)) {
    const first = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const n = headerLength(first);
    if (n === null || n > MAX_HEADER_BYTES)
      return {
        name: file.name,
        size: file.size,
        kind: "safetensors",
        image: null,
        safetensors: null,
        origin: null,
        error: "This doesn't look like a safetensors file (its header is missing or cut off).",
      };
    const info = await api.fileInfo(file.slice(0, 8 + n), file.name);
    return { ...info, size: file.size };
  }
  if (file.size > MAX_IMAGE_UPLOAD)
    throw new Error("That file is too large to inspect (200 MB max for images).");
  return api.fileInfo(file, file.name);
}

export function FileInfoView() {
  const target = useFileInfoTarget((s) => s.target);
  const setTarget = useFileInfoTarget((s) => s.set);
  const [dropped, setDropped] = useState<File | null>(null);
  const preview = useMemo(
    () => (dropped && /^image\//.test(dropped.type) ? URL.createObjectURL(dropped) : null),
    [dropped],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const info = useQuery({
    queryKey: [
      "fileinfo",
      dropped ? `${dropped.name}:${dropped.size}:${dropped.lastModified}` : target,
    ],
    queryFn: () =>
      dropped
        ? inspectFile(dropped)
        : target?.type === "gallery"
          ? api.galleryFileInfo(target.id)
          : api.modelFileInfo((target as { id: string }).id),
    enabled: dropped !== null || target !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const pick = (file: File) => {
    setTarget(null);
    setDropped(file);
  };
  const imageSrc =
    preview ??
    (target?.type === "gallery" && info.data?.image
      ? `/api/gallery/images/${target.id}/file`
      : null);

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-8 pt-8 pb-16">
        <div className="flex items-end gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">File Info</h1>
            <p className="text-sm text-fg-3">
              Drop an image to see how it was made, or a .safetensors model to read its training
              details.
            </p>
          </div>
        </div>

        <DropZone
          onFile={pick}
          accept={ACCEPT}
          compact={Boolean(dropped || target)}
          busy={info.isFetching}
          title={
            dropped || target
              ? "Drop another file, or click to pick one"
              : "Drop a file here, or click to pick one"
          }
          hint="PNG, WebP and JPEG images · .safetensors models (only the header is read)"
          icon="file-info"
        />

        {!dropped && !target ? null : info.isLoading ? (
          <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-6">
            <Skeleton className="aspect-square" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          </div>
        ) : info.error ? (
          <EmptyState
            icon="errors"
            tone="warning"
            title="Couldn't read that file"
            text={info.error.message}
          />
        ) : info.data ? (
          <Result info={info.data} imageSrc={imageSrc} dropped={dropped} />
        ) : null}
      </div>
    </div>
  );
}

function Result({
  info,
  imageSrc,
  dropped,
}: {
  info: FileInfo;
  imageSrc: string | null;
  dropped: File | null;
}) {
  const kindLabel =
    info.kind === "image"
      ? info.image?.format.toUpperCase()
      : info.kind === "safetensors"
        ? "safetensors"
        : "Unknown";
  return (
    <div className="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-6">
      <Panel className="sticky top-0 flex flex-col overflow-hidden">
        {info.kind === "image" && imageSrc ? (
          <div className="checker grid max-h-[420px] place-items-center overflow-hidden">
            <img src={imageSrc} alt="" className="max-h-[420px] w-full object-contain" />
          </div>
        ) : (
          <div className="grid h-40 place-items-center bg-surface-2 text-fg-3">
            <Icon name={info.kind === "safetensors" ? "models" : "file"} size={36} />
          </div>
        )}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1 text-sm font-medium break-all text-fg">
              {info.name}
            </span>
            <Badge>{kindLabel}</Badge>
          </div>
          <PropertyList
            labelWidth={72}
            items={[
              { label: "Size", value: formatBytes(info.size) },
              {
                label: "Pixels",
                value: info.image?.width ? `${info.image.width}×${info.image.height}` : null,
              },
              {
                label: "From",
                value: info.origin
                  ? info.origin.type === "gallery"
                    ? "Gallery"
                    : "Models folder"
                  : "Dropped file",
              },
            ]}
          />
        </div>
      </Panel>
      <div className="flex min-w-0 flex-col gap-5">
        {info.error ? (
          <p className="flex items-start gap-2 rounded-md border border-yellow/30 bg-yellow/10 px-3 py-2.5 text-sm text-warning">
            <Icon name="errors" size={15} className="mt-0.5 shrink-0" />
            {info.error}
          </p>
        ) : null}
        {info.image ? <ImageSections image={info.image} info={info} dropped={dropped} /> : null}
        {info.safetensors ? <SafetensorsSections st={info.safetensors} /> : null}
      </div>
    </div>
  );
}

/* ── images ───────────────────────────────────────────────────────────────── */

const SOURCE: Record<string, { label: string; icon: IconName }> = {
  blombo: { label: "Made with BlomboUI", icon: "sparkle" },
  comfy: { label: "Made with ComfyUI", icon: "workflow" },
  a1111: { label: "A1111 / Forge parameters", icon: "text" },
  none: { label: "No generation settings", icon: "info" },
};

function ImageSections({
  image,
  info,
  dropped,
}: {
  image: ImageFileInfo;
  info: FileInfo;
  dropped: File | null;
}) {
  const s = image.summary;
  const navigate = useNavigate();
  const profileId = useSession((st) => st.profileId);
  const importWorkflow = useImportWorkflow();
  const source = SOURCE[s.source] ?? { label: s.source, icon: "info" as IconName };

  const importIt = async () => {
    let file = dropped;
    if (!file && info.origin?.type === "gallery") {
      const blob = await (await fetch(`/api/gallery/images/${info.origin.id}/file`)).blob();
      file = new File([blob], info.name, { type: blob.type });
    }
    if (!file) return;
    importWorkflow.mutate(file, {
      onSuccess: (r) => {
        if (profileId) useActiveChoice.getState().choose(profileId, r.workflow.id);
        const problems = r.findings.filter((f) => f.level !== "info");
        toast(
          problems.length
            ? `Imported "${r.workflow.name}" with ${problems.length} thing${problems.length === 1 ? "" : "s"} to fix: ${problems[0]?.message}`
            : `Imported "${r.workflow.name}". It's now the active workflow.`,
          problems.length ? "warning" : "success",
        );
      },
      onError: (e) => toast(e.message, "error"),
    });
  };

  return (
    <>
      <Panel className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-fg">
            <Icon name={source.icon} size={16} className="text-accent-ink" />
            {source.label}
          </span>
          {image.blombo?.name ? <Badge tone="accent">{image.blombo.name}</Badge> : null}
          <span className="ml-auto flex gap-2">
            {image.hasWorkflow ? (
              <Button
                icon="import"
                loading={importWorkflow.isPending}
                onClick={() => void importIt()}
              >
                Import as workflow
              </Button>
            ) : null}
            <Button
              variant="primary"
              icon="generate"
              disabled={s.source === "none"}
              onClick={() =>
                void applyImageSettings(image.settings, s.seed).then((ok) => {
                  if (ok && profileId)
                    void navigate({
                      to: "/p/$profileId/$view",
                      params: { profileId, view: "generate" },
                    });
                })
              }
            >
              Use these settings
            </Button>
          </span>
        </div>
        {s.source === "none" ? (
          <p className="text-sm text-fg-3">
            This image has no prompt or settings in it. Images saved by ComfyUI, BlomboUI or A1111
            usually do, unless metadata was removed.
          </p>
        ) : (
          <>
            {s.prompt ? <TextBlock label="Prompt" text={s.prompt} /> : null}
            {s.negative ? <TextBlock label="Negative prompt" text={s.negative} /> : null}
            <PropertyList
              items={[
                { label: "Model", value: s.model, copy: s.model ?? undefined },
                {
                  label: "LoRAs",
                  value: s.loras.length ? (
                    <span className="flex flex-wrap gap-1">
                      {s.loras.map((l) => (
                        <Badge key={l.name}>
                          {l.name}
                          {l.strength !== null ? (
                            <span className="text-fg-3">{l.strength}</span>
                          ) : null}
                        </Badge>
                      ))}
                    </span>
                  ) : null,
                },
                {
                  label: "Sampler",
                  value: [s.sampler, s.scheduler].filter(Boolean).join(" · ") || null,
                },
                { label: "Steps", value: s.steps },
                { label: "CFG", value: s.cfg },
                {
                  label: "Seed",
                  value: s.seed,
                  copy: s.seed !== null ? String(s.seed) : undefined,
                  mono: true,
                },
                { label: "Size", value: s.width && s.height ? `${s.width}×${s.height}` : null },
                { label: "Workflow", value: s.workflow },
              ]}
            />
          </>
        )}
      </Panel>

      {image.a1111?.settings.length ? (
        <Section title="All parameters" icon="sliders" count={image.a1111.settings.length}>
          <PropertyList
            labelWidth={150}
            items={image.a1111.settings.map(([k, v]) => ({ label: k, value: v, copy: v }))}
          />
        </Section>
      ) : null}

      {image.comfy ? (
        <Section title="ComfyUI graph" icon="workflow" count={image.comfy.length}>
          <div className="flex flex-col divide-y divide-line">
            {image.comfy.map((n) => (
              <div key={n.id} className="grid grid-cols-[180px_minmax(0,1fr)] gap-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-fg">{n.title}</span>
                  <span className="truncate font-mono text-2xs text-fg-3">
                    #{n.id} {n.title !== n.type ? `· ${n.type}` : ""}
                  </span>
                </div>
                {n.inputs.length ? (
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
                    {n.inputs.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-fg-3">{k}</dt>
                        <dd className="truncate font-mono text-fg-2" title={formatValue(v)}>
                          {formatValue(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <span className="text-xs text-fg-4">No settings</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {image.chunks.length ? (
        <Section title="Raw metadata" icon="file-text" count={image.chunks.length}>
          <div className="flex flex-col gap-3">
            {image.chunks.map((c) => (
              <div key={c.key} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium text-fg">{c.key}</span>
                  <span className="text-2xs text-fg-3">{c.length.toLocaleString()} characters</span>
                  <CopyButton text={c.text} label={`Copy ${c.key}`} className="ml-auto" />
                </div>
                <pre className="max-h-48 overflow-auto rounded-md border border-line bg-sunken p-2.5 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-fg-2">
                  {c.text}
                </pre>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function formatValue(v: unknown): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/* ── safetensors ──────────────────────────────────────────────────────────── */

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

function SafetensorsSections({ st }: { st: SafetensorsInfo }) {
  const t = st.training;
  const [metaFilter, setMetaFilter] = useState("");
  const maxTag = t.tags[0]?.[1] ?? 1;
  const meta = Object.entries(st.metadata).filter(
    ([k, v]) => !metaFilter || `${k} ${v}`.toLowerCase().includes(metaFilter.toLowerCase()),
  );
  const hasTraining = Boolean(
    t.network || t.dim || t.epochs || t.steps || t.baseModel || t.resolution,
  );
  return (
    <>
      <Panel className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <Icon name="models" size={16} className="text-accent-ink" />
          <span className="text-sm font-medium text-fg">{t.title ?? GUESS[st.guess]}</span>
          <Badge tone="accent">{GUESS[st.guess]}</Badge>
        </div>
        <PropertyList
          items={[
            { label: "Base model", value: t.baseModel },
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
            <span className="label-caps">Trigger words</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {t.triggerWords.map((w) => (
                <Chip
                  key={w}
                  size="sm"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(w)
                      .then(() => toast(`Copied "${w}"`, "success"))
                  }
                >
                  {w}
                </Chip>
              ))}
              <CopyButton text={t.triggerWords.join(", ")} label="Copy all trigger words" />
            </div>
          </div>
        ) : null}
      </Panel>

      {hasTraining ? (
        <Section title="Training" icon="activity">
          <PropertyList
            labelWidth={130}
            items={[
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
            ]}
          />
          {t.datasets.length ? (
            <div className="mt-4 flex flex-col gap-1.5">
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
        </Section>
      ) : null}

      {t.tags.length ? (
        <Section title="Training tags" icon="tag" count={t.tags.length}>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-fg-3">
              Bigger tags were used more. Click a tag to copy it.
            </span>
            <CopyButton
              text={t.tags
                .slice(0, 20)
                .map(([tag]) => tag)
                .join(", ")}
              label="Copy the top 20 tags"
              className="ml-auto"
            />
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            {t.tags.slice(0, 150).map(([tag, n]) => {
              const w = n / maxTag;
              return (
                <button
                  key={tag}
                  type="button"
                  title={`${tag}: ${n}`}
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(tag)
                      .then(() => toast(`Copied "${tag}"`, "success"))
                  }
                  className={cn(
                    "rounded-xs leading-tight transition-colors hover:text-accent-ink focus-ring",
                    w > 0.66 ? "text-fg" : w > 0.33 ? "text-fg-2" : "text-fg-3",
                  )}
                  style={{ fontSize: `${12 + Math.round(w * 8)}px` }}
                >
                  {tag}
                  <span className="ml-0.5 font-mono text-[10px] text-fg-4">{n}</span>
                </button>
              );
            })}
          </div>
        </Section>
      ) : null}

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

/* ── shared bits ──────────────────────────────────────────────────────────── */

function Section({
  title,
  icon,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: IconName;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible
      title={title}
      icon={icon}
      defaultOpen={defaultOpen}
      actions={count !== undefined ? <Badge>{count.toLocaleString()}</Badge> : undefined}
    >
      {children}
    </Collapsible>
  );
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionTitle actions={<CopyButton text={text} label={`Copy ${label.toLowerCase()}`} />}>
        {label}
      </SectionTitle>
      <p className="max-h-56 overflow-y-auto rounded-md border border-line bg-field p-3 text-sm leading-relaxed whitespace-pre-wrap text-fg-2">
        {text}
      </p>
    </div>
  );
}
