/**
 * File Info's Civitai part for a model file. It's found by hash: first the hashes a trainer wrote
 * into the header (instant), then the file's SHA256 (a local model's is stored after the first
 * time; a dropped file streams to the server, which keeps nothing). The match fills the filmstrip
 * (the creator's own images, CivitaiCarousel.tsx), the settings of the picked image, a details panel
 * with the trigger words, and the description.
 */
import { Icon } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { useGoToView } from "@client/lib/hooks";
import { glide } from "@client/lib/motion";
import { qk, useCivitaiByHash } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Badge, Button, Chip, Collapsible, CopyButton, Panel } from "@client/ui";
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
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useId, useMemo, useState } from "react";
import { localVersions } from "../models/civitai/marks";
import { openCivitaiPage, useCivitaiOpener } from "../models/civitai/open";
import { RichText } from "../models/civitai/RichText";
import { useCivitai } from "../models/civitai/state";
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
  const civitai = useCivitaiOpener();
  const page = `${match.model.url}?modelVersionId=${match.versionId}`;
  const host = new URL(match.model.url).host;
  // Without a key Civitai accepted, Models would open the site anyway: one button for it.
  if (!civitai.inApp)
    return (
      <Button
        variant="primary"
        icon="external"
        onClick={() => openCivitaiPage(page, match.model.name)}
      >
        Open on {host}
      </Button>
    );
  return (
    <>
      <Button
        variant="primary"
        icon="models"
        onClick={() =>
          civitai.model({
            modelId: match.model.id,
            versionId: match.versionId,
            name: match.model.name,
          })
        }
      >
        Open in Models
      </Button>
      <button
        type="button"
        onClick={() => openCivitaiPage(page, match.model.name)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-accent-ink hover:underline focus-ring"
      >
        {host}
        <Icon name="external" size={12} />
      </button>
    </>
  );
}

/** The picked image's prompt and settings, as its poster shared them. */
export function ImageSettings({ meta }: { meta: CivitaiImageMeta }) {
  return (
    <Panel tone="civitai" className="p-5">
      <ImageSettingsBody meta={meta} />
    </Panel>
  );
}

/** ImageSettings without its panel, inside another surface (the model page's fold). */
export function ImageSettingsBody({ meta }: { meta: CivitaiImageMeta }) {
  return (
    <div className="flex flex-col gap-4">
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
    </div>
  );
}

/**
 * One panel: name, creator, stats and trigger words; details and tags fold under "More details"
 * (closed by default, so the picked image's prompt below stays in view).
 */
export function CivitaiDetails({ match }: { match: Found }) {
  const { model } = match;
  const version = versionOf(match);
  const goTo = useGoToView();
  const setFilter = useCivitai((s) => s.setFilter);
  const showHome = useCivitai((s) => s.showHome);
  const visit = useCivitai((s) => s.visit);
  const installed = localVersions(model.id, model.local, []).has(match.versionId);
  const browse = (filter: { query: string; username: string }) => {
    // A creator opens in Following (looked at, not followed), so Browse's search stays.
    if (filter.username) visit(filter.username);
    else {
      setFilter(filter);
      showHome("browse");
    }
    useModelsNav.getState().setTab("civitai");
    goTo("models");
  };
  const words = version?.trainedWords ?? [];
  const [more, setMore] = useState(false);
  const moreId = useId();
  return (
    <Panel tone="civitai" className="flex min-w-0 flex-col gap-4 p-5">
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
      {words.length ? (
        <Group title="Trigger words">
          <div className="flex flex-wrap gap-1.5">
            {words.map((w) => (
              <span
                key={w}
                className="inline-flex h-7 max-w-full min-w-0 items-center gap-0.5 rounded-md border border-line bg-field pr-0.5 pl-2 text-fg"
              >
                <span className="truncate font-mono text-xs">{w}</span>
                <CopyButton text={w} label={`Copy "${w}"`} />
              </span>
            ))}
          </div>
        </Group>
      ) : null}
      <AnimatePresence initial={false}>
        {more ? (
          <motion.div
            id={moreId}
            key="more"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={glide}
            className="flex flex-col gap-4 overflow-hidden"
          >
            <Group title="Details">
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
                  {
                    label: "Model id",
                    value: String(model.id),
                    copy: String(model.id),
                    mono: true,
                  },
                  {
                    label: "Version id",
                    value: String(match.versionId),
                    copy: String(match.versionId),
                    mono: true,
                  },
                ]}
              />
            </Group>
            {model.tags.length ? (
              <Group title="Tags">
                <div className="flex flex-wrap gap-1">
                  {model.tags.slice(0, 16).map((t) => (
                    <Chip
                      key={t}
                      size="sm"
                      icon="tag"
                      onClick={() => browse({ query: t, username: "" })}
                    >
                      {t}
                    </Chip>
                  ))}
                </div>
              </Group>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={more}
        aria-controls={moreId}
        onClick={() => setMore(!more)}
        iconRight={more ? "chevron-up" : "chevron-down"}
        className="-my-1.5 -ml-2.5 self-start"
      >
        {more ? "Fewer details" : "More details"}
      </Button>
    </Panel>
  );
}

/** A titled part of the model panel, under a line. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-line pt-4">
      <h3 className="label-caps">{title}</h3>
      {children}
    </section>
  );
}

/** The model's (and the version's) description from Civitai, folded. */
export function CivitaiAbout({ match }: { match: Found }) {
  const version = versionOf(match);
  if (!match.model.description.length && !version?.description.length) return null;
  return (
    <Collapsible title="About this model" icon="file-text" defaultOpen={false} tone="civitai">
      <div className="flex flex-col gap-5">
        <RichText blocks={match.model.description} />
        {version?.description.length ? (
          <div className="flex flex-col gap-2">
            <span className="label-caps">About {version.name}</span>
            <RichText blocks={version.description} />
          </div>
        ) : null}
      </div>
    </Collapsible>
  );
}
