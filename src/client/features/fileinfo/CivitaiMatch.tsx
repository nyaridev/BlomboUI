/**
 * File Info's Civitai part for a model file. It's found by hash: first the hashes a trainer wrote
 * into the header (instant), then the file's SHA256 (a local model's is stored after the first
 * time; a dropped file streams to the server, which keeps nothing). The match fills the filmstrip
 * (the creator's own images, CivitaiCarousel.tsx), the settings of the picked image, a details panel, trigger
 * words and the description.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useGoToView } from "@client/lib/hooks";
import { qk, useCivitaiByHash, useSettings } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Badge, Button, Chip, Collapsible, CopyButton, Panel, toast } from "@client/ui";
import {
  CIVITAI_TYPE_LABELS,
  type CivitaiImage,
  type CivitaiImageMeta,
  type CivitaiMatch,
  compactCount,
} from "@shared/civitai";
import type { FileInfo } from "@shared/fileinfo";
import { embeddedHashes } from "@shared/safetensors";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { localVersions } from "../models/civitai/marks";
import { RichText } from "../models/civitai/RichText";
import { openCivitaiModel, useCivitai } from "../models/civitai/state";
import { useModelsNav } from "../models/nav";
import { CarouselPlaceholder } from "./CivitaiCarousel";
import { Facts, TextBlock } from "./parts";

export type Found = NonNullable<CivitaiMatch>;

export interface FileCivitai {
  status: "hashing" | "looking" | "found" | "none" | "error";
  match: Found | null;
  error: string | null;
  retry: () => void;
  sha256: string | null;
  autov2: string | null;
  /** The AutoV3 hash written in the header, when there is one. */
  autov3: string | null;
}

/** The Civitai lookup for a model file (null for anything else). */
export function useFileCivitai(info: FileInfo, dropped: File | null): FileCivitai | null {
  const profileId = useSession((s) => s.profileId);
  const isModel = info.kind === "safetensors";
  const modelId = info.origin?.type === "model" ? info.origin.id : null;
  const fileKey = dropped ? `${dropped.name}:${dropped.size}:${dropped.lastModified}` : modelId;
  const embedded = useMemo(
    () => (info.safetensors ? embeddedHashes(info.safetensors.metadata) : []),
    [info.safetensors],
  );

  const quick = useQuery({
    queryKey: qk.civitaiByHash(profileId, embedded.join(",")),
    queryFn: async () => {
      for (const hash of embedded) {
        const hit = await api.civitaiByHash(hash);
        if (hit) return hit;
      }
      return null;
    },
    enabled: isModel && profileId !== null && embedded.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const quickDone = embedded.length === 0 || quick.data !== undefined || quick.isError;
  // A local model's SHA256 is always shown; a dropped file is read whole only when it must be.
  const needHash = modelId !== null || (dropped !== null && quickDone && !quick.data);
  const hashes = useQuery({
    queryKey: ["fileinfo-hash", profileId, fileKey],
    queryFn: () => (dropped ? api.fileHash(dropped) : api.modelHashes(modelId as string)),
    enabled: isModel && fileKey !== null && needHash,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const sha256 = hashes.data?.sha256 ?? null;
  const full = useCivitaiByHash(quickDone && !quick.data ? sha256 : null);

  if (!isModel || fileKey === null) return null;
  const match = quick.data ?? full.data ?? null;
  const error = hashes.error
    ? `Couldn't hash the file: ${hashes.error.message}`
    : full.error
      ? `Couldn't ask Civitai: ${full.error.message}`
      : null;
  const status: FileCivitai["status"] = match
    ? "found"
    : error
      ? "error"
      : !quickDone || full.isLoading
        ? "looking"
        : hashes.isLoading
          ? dropped
            ? "hashing"
            : "looking"
          : "none";
  return {
    status,
    match,
    error,
    retry: () => {
      void hashes.refetch();
      void full.refetch();
    },
    sha256,
    autov2: hashes.data?.autov2 ?? null,
    autov3: embedded[0]?.length === 12 ? embedded[0] : null,
  };
}

export function versionOf(match: Found) {
  return match.model.versions.find((v) => v.id === match.versionId) ?? null;
}

/** The version's images posted by the model's creator (all of them when none say who). */
export function authorImages(match: Found): CivitaiImage[] {
  const all = versionOf(match)?.images ?? [];
  const own = all.filter((i) => i.by && i.by === match.model.creator);
  return own.length ? own : all;
}

/**
 * While searching, the carousel's placeholder (the same height, so nothing moves when it's
 * found); when nothing was found or on an error, a slim bar. A match shows the carousel.
 */
export function CivitaiStatus({ civitai }: { civitai: FileCivitai }) {
  const { status } = civitai;
  if (status === "found") return null;
  if (status === "looking" || status === "hashing")
    return (
      <CarouselPlaceholder
        message={
          status === "hashing"
            ? "Reading the whole file to find it on Civitai by its hash…"
            : "Searching Civitai…"
        }
      />
    );
  return (
    <Panel className="flex items-center gap-3 px-5 py-3 text-sm text-fg-3">
      <Icon name={status === "error" ? "errors" : "globe"} size={16} className="shrink-0" />
      <span className="flex-1">
        {status === "error"
          ? civitai.error
          : "No Civitai match. The model may be private, taken down, changed after download or from somewhere else."}
      </span>
      {status === "error" ? (
        <Button size="sm" onClick={civitai.retry}>
          Try again
        </Button>
      ) : null}
    </Panel>
  );
}

/** Open in Models and the site link, for the actions row under the carousel. */
export function CivitaiLinks({ match }: { match: Found }) {
  const goTo = useGoToView();
  return (
    <>
      <Button
        variant="primary"
        icon="models"
        onClick={() => {
          openCivitaiModel(match.model.id, match.model.name);
          goTo("models");
        }}
      >
        Open in Models
      </Button>
      <a
        href={`${match.model.url}?modelVersionId=${match.versionId}`}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-accent-ink hover:underline focus-ring"
      >
        {new URL(match.model.url).host}
        <Icon name="external" size={12} />
      </a>
    </>
  );
}

/** How the image on screen was made, as its poster shared it. */
export function ImageSettings({ meta }: { meta: CivitaiImageMeta }) {
  return (
    <Panel className="flex flex-col gap-4 p-5">
      <span className="label-caps">How this image was made</span>
      {meta.prompt ? <TextBlock label="Prompt" text={meta.prompt} /> : null}
      {meta.negative ? <TextBlock label="Negative prompt" text={meta.negative} /> : null}
      <Facts
        items={meta.settings.map(([label, value]) => ({
          label,
          value,
          mono: label === "Seed",
          copy: label === "Seed" ? value : undefined,
        }))}
      />
    </Panel>
  );
}

/** Name, creator, type, version, base model and stats beside the trigger words. */
export function CivitaiDetails({ match }: { match: Found }) {
  const { model } = match;
  const version = versionOf(match);
  const goTo = useGoToView();
  const setFilter = useCivitai((s) => s.setFilter);
  const show = useCivitai((s) => s.show);
  const installed = localVersions(model.id, model.local, []).has(match.versionId);
  const browse = (filter: { query: string; username: string }) => {
    setFilter(filter);
    show(null);
    useModelsNav.getState().setTab("civitai");
    goTo("models");
  };
  const words = version?.trainedWords ?? [];
  return (
    <div className="flex gap-4 max-lg:flex-col">
      <Panel className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{CIVITAI_TYPE_LABELS[model.type] ?? model.type}</Badge>
            {version?.baseModel ? <Badge>{version.baseModel}</Badge> : null}
            {model.nsfw ? <Badge tone="warning">NSFW</Badge> : null}
            {installed ? (
              <Badge tone="success">
                <Icon name="check" size={11} /> In your models folder
              </Badge>
            ) : null}
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-balance break-words text-fg">
            {model.name}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-3">
            {model.creator ? (
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-sm text-accent-ink hover:underline focus-ring"
                title={`More from ${model.creator}`}
                onClick={() => browse({ username: model.creator ?? "", query: "" })}
              >
                {model.creatorImage ? (
                  <img
                    src={model.creatorImage}
                    alt=""
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : (
                  <Icon name="user" size={14} />
                )}
                {model.creator}
              </button>
            ) : null}
            {version ? <span>{version.name}</span> : null}
            <span className="flex items-center gap-1 tabular" title="Downloads">
              <Icon name="download" size={13} />
              {compactCount(model.downloads)}
            </span>
            <span className="flex items-center gap-1 tabular" title="Likes">
              <Icon name="heart" size={13} />
              {compactCount(model.likes)}
            </span>
          </div>
        </div>
        <Facts
          columns={3}
          items={[
            {
              label: "Published",
              value: version?.publishedAt
                ? new Date(version.publishedAt).toLocaleDateString()
                : null,
            },
            {
              label: "This version",
              value: version ? `${compactCount(version.downloads)} downloads` : null,
            },
            {
              label: "Versions",
              value: model.versions.length > 1 ? `${model.versions.length} on Civitai` : null,
            },
            { label: "Model id", value: String(model.id), copy: String(model.id), mono: true },
            {
              label: "Version id",
              value: String(match.versionId),
              copy: String(match.versionId),
              mono: true,
            },
          ]}
        />
        {model.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {model.tags.slice(0, 16).map((t) => (
              <Chip key={t} size="sm" icon="tag" onClick={() => browse({ query: t, username: "" })}>
                {t}
              </Chip>
            ))}
          </div>
        ) : null}
      </Panel>
      {words.length ? (
        <Panel className="flex w-[38%] shrink-0 flex-col gap-2 p-5 max-lg:w-full">
          <div className="flex items-center gap-2">
            <span className="label-caps">Trigger words</span>
            <CopyButton
              text={words.join(", ")}
              label="Copy all trigger words"
              className="ml-auto"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {words.map((w) => (
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
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

/** The model's (and the version's) description from Civitai, folded. */
export function CivitaiAbout({ match }: { match: Found }) {
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  const version = versionOf(match);
  const blur = match.model.nsfw && blurNsfw;
  if (!match.model.description.length && !version?.description.length) return null;
  return (
    <Collapsible title="About this model" icon="file-text" defaultOpen={false}>
      <div className="flex flex-col gap-5">
        <RichText blocks={match.model.description} blurImages={blur} />
        {version?.description.length ? (
          <div className="flex flex-col gap-2">
            <span className="label-caps">About {version.name}</span>
            <RichText blocks={version.description} blurImages={blur} />
          </div>
        ) : null}
      </div>
    </Collapsible>
  );
}
