/**
 * File Info: drop, paste or pick a file and read what's inside. The top is the picture: an image
 * itself, or for a model the creator's images from Civitai (found by hash, CivitaiMatch.tsx) with
 * how the one on screen was made; the actions sit under it. Below come the file's facts and its
 * sections: for images how they were made (Blombo, ComfyUI or A1111 metadata), the models they
 * used (UsedModels.tsx: your copy, their Civitai page), the graph and every text chunk; for models the Civitai details and the header (Safetensors.tsx). Files picked
 * in the gallery or the Models view open here too, and a file dropped anywhere in the window.
 * Nothing is modified, except "Use as the model's picture", which asks for it.
 *
 * A dropped .safetensors file's header is read in the browser; when it carries no hash Civitai
 * knows, the file streams to the server for its SHA256, and the server keeps nothing.
 */

import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useClock } from "@client/lib/clock";
import { formatBytes } from "@client/lib/number";
import { useImportWorkflow, useSaveModelInfo, useSettings } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import {
  Badge,
  Button,
  CopyButton,
  DropZone,
  EmptyState,
  Panel,
  PropertyList,
  Skeleton,
  toast,
} from "@client/ui";
import type { CivitaiImage } from "@shared/civitai";
import type { FileInfo, ImageFileInfo } from "@shared/fileinfo";
import { headerLength, MAX_HEADER_BYTES } from "@shared/safetensors";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyImageSettings } from "../generate/applySettings";
import { useActiveChoice } from "../generate/workflow";
import { CivitaiCarousel } from "./CivitaiCarousel";
import {
  authorImages,
  CivitaiAbout,
  CivitaiDetails,
  CivitaiLinks,
  CivitaiStatus,
  type FileCivitai,
  ImageSettings,
  useFileCivitai,
} from "./CivitaiMatch";
import { PageDropOverlay, usePageFileDrop } from "./PageDrop";
import { Facts, Section, TextBlock } from "./parts";
import { SafetensorsSections } from "./Safetensors";
import { useFileInfoTarget } from "./state";
import { UsedModels } from "./UsedModels";

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
        modified: file.lastModified,
        kind: "safetensors",
        image: null,
        safetensors: null,
        origin: null,
        error: "This doesn't look like a safetensors file (its header is missing or cut off).",
      };
    const info = await api.fileInfo(file.slice(0, 8 + n), file.name);
    return { ...info, size: file.size, modified: file.lastModified };
  }
  if (file.size > MAX_IMAGE_UPLOAD)
    throw new Error("That file is too large to inspect (200 MB max for images).");
  return { ...(await api.fileInfo(file, file.name)), modified: file.lastModified };
}

export function FileInfoView() {
  const target = useFileInfoTarget((s) => s.target);
  const setTarget = useFileInfoTarget((s) => s.set);
  const [dropped, setDropped] = useState<File | null>(null);
  const picker = useRef<HTMLInputElement>(null);
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
  const clear = () => {
    setTarget(null);
    setDropped(null);
  };
  const dragging = usePageFileDrop(pick);
  const open = Boolean(dropped || target);
  const imageSrc =
    preview ??
    (target?.type === "gallery" && info.data?.image
      ? `/api/gallery/images/${target.id}/file`
      : null);

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <PageDropOverlay show={dragging} />
      <input
        ref={picker}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) pick(file);
          e.target.value = "";
        }}
      />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-8 pt-8 pb-16 max-lg:px-3 max-lg:pt-4">
        <div className="flex items-center gap-2">
          <h1 className="flex-1 text-2xl font-semibold tracking-tight text-fg">File Info</h1>
          {open ? (
            <>
              <Button variant="ghost" icon="x" onClick={clear}>
                Clear
              </Button>
              <Button icon="file-info" onClick={() => picker.current?.click()}>
                Pick a file
              </Button>
            </>
          ) : null}
        </div>

        {!open ? (
          <DropZone
            onFile={pick}
            accept={ACCEPT}
            title="Drop or paste a file anywhere, or click to pick one"
            hint="PNG, WebP and JPEG images · .safetensors models, looked up on Civitai by their hash"
            icon="file-info"
          />
        ) : info.isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="aspect-[16/9] max-h-[34rem] w-full" />
            <Skeleton className="h-24 w-full" />
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
  const civitai = useFileCivitai(info, dropped);
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  const [shown, setShown] = useState(0);
  const images = useMemo(
    () => (civitai?.match ? authorImages(civitai.match) : []),
    [civitai?.match],
  );
  const current = images[shown] ?? null;

  return (
    <div className="flex flex-col gap-4">
      {civitai?.match && images.length ? (
        <CivitaiCarousel
          images={images}
          label={`${civitai.match.model.name} images`}
          blurNsfw={blurNsfw}
          onIndex={setShown}
        />
      ) : civitai ? (
        <CivitaiStatus civitai={civitai} />
      ) : info.kind === "image" && imageSrc ? (
        <div className="checker grid max-h-[34rem] place-items-center overflow-hidden rounded-xl border border-line">
          <img src={imageSrc} alt="" className="max-h-[34rem] w-full object-contain" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {info.image ? <ImageActions image={info.image} info={info} dropped={dropped} /> : null}
        {civitai?.match ? (
          <>
            {info.origin?.type === "model" && current ? (
              <UseAsPicture modelId={info.origin.id} image={current} />
            ) : null}
            <CivitaiLinks match={civitai.match} />
          </>
        ) : null}
      </div>

      {civitai?.match ? (
        <>
          <CivitaiDetails match={civitai.match} />
          <CivitaiAbout match={civitai.match} />
        </>
      ) : null}
      {current?.meta ? <ImageSettings meta={current.meta} /> : null}

      <FileFacts info={info} civitai={civitai} />
      {info.error ? (
        <p className="flex items-start gap-2 rounded-md border border-yellow/30 bg-yellow/10 px-3 py-2.5 text-sm text-warning">
          <Icon name="errors" size={15} className="mt-0.5 shrink-0" />
          {info.error}
        </p>
      ) : null}
      {info.image ? <ImageSections image={info.image} /> : null}
      {info.safetensors ? <SafetensorsSections st={info.safetensors} /> : null}
    </div>
  );
}

/** Name, kind, size, dates, where it came from and its hashes. */
function FileFacts({ info, civitai }: { info: FileInfo; civitai: FileCivitai | null }) {
  const clock = useClock();
  const kindLabel =
    info.kind === "image"
      ? info.image?.format.toUpperCase()
      : info.kind === "safetensors"
        ? "safetensors"
        : "Unknown";
  return (
    <Panel className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-2">
        <Icon
          name={info.kind === "image" ? "image" : info.kind === "safetensors" ? "models" : "file"}
          size={16}
          className="mt-0.5 shrink-0 text-accent-ink"
        />
        <span className="min-w-0 flex-1 text-sm font-medium break-all text-fg">{info.name}</span>
        <Badge>{kindLabel}</Badge>
      </div>
      <Facts
        items={[
          { label: "Size", value: formatBytes(info.size) },
          {
            label: "Pixels",
            value: info.image?.width ? `${info.image.width}×${info.image.height}` : null,
          },
          {
            label: "Modified",
            value: info.modified ? clock.dateTime(info.modified) : null,
          },
          {
            label: "From",
            value: info.origin
              ? info.origin.type === "gallery"
                ? "Gallery"
                : "Models folder"
              : "Dropped file",
          },
          {
            label: "AutoV2",
            value: civitai?.autov2,
            copy: civitai?.autov2 ?? undefined,
            mono: true,
          },
          {
            label: "AutoV3",
            value: civitai?.autov3,
            copy: civitai?.autov3 ?? undefined,
            mono: true,
          },
          {
            label: "SHA256",
            value: civitai?.sha256,
            copy: civitai?.sha256 ?? undefined,
            mono: true,
            wide: true,
          },
        ]}
      />
    </Panel>
  );
}

/** Make the Civitai image on screen the local model's picture. */
function UseAsPicture({ modelId, image }: { modelId: string; image: CivitaiImage }) {
  const save = useSaveModelInfo();
  return (
    <Button
      icon="image"
      loading={save.isPending}
      onClick={() =>
        void (async () => {
          try {
            const blob = await (await fetch(image.full)).blob();
            await save.mutateAsync({ info: null, picture: { id: modelId, image: blob } });
            toast("That image is now the model's picture.", "success");
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), "error");
          }
        })()
      }
    >
      Use as the model's picture
    </Button>
  );
}

/* ── images ───────────────────────────────────────────────────────────────── */

const SOURCE: Record<string, { label: string; icon: IconName }> = {
  blombo: { label: "Made with BlomboUI", icon: "sparkle" },
  comfy: { label: "Made with ComfyUI", icon: "workflow" },
  a1111: { label: "A1111 / Forge parameters", icon: "text" },
  none: { label: "No generation settings", icon: "info" },
};

function ImageActions({
  image,
  info,
  dropped,
}: {
  image: ImageFileInfo;
  info: FileInfo;
  dropped: File | null;
}) {
  const navigate = useNavigate();
  const profileId = useSession((st) => st.profileId);
  const importWorkflow = useImportWorkflow();

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
      {image.hasWorkflow ? (
        <Button icon="import" loading={importWorkflow.isPending} onClick={() => void importIt()}>
          Import as workflow
        </Button>
      ) : null}
      <Button
        variant="primary"
        icon="generate"
        disabled={image.summary.source === "none"}
        onClick={() =>
          void applyImageSettings(image.settings, image.summary.seed).then((ok) => {
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
    </>
  );
}

function ImageSections({ image }: { image: ImageFileInfo }) {
  const s = image.summary;
  const source = SOURCE[s.source] ?? { label: s.source, icon: "info" as IconName };
  return (
    <>
      <Panel className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-fg">
            <Icon name={source.icon} size={16} className="text-accent-ink" />
            {source.label}
          </span>
          {image.blombo?.name ? <Badge tone="accent">{image.blombo.name}</Badge> : null}
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
            <Facts
              items={[
                { label: "Sampler", value: s.sampler },
                { label: "Scheduler", value: s.scheduler },
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

      <UsedModels image={image} />

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
              <div
                key={n.id}
                className="grid grid-cols-[180px_minmax(0,1fr)] gap-3 py-2 max-lg:grid-cols-1 max-lg:gap-1"
              >
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
