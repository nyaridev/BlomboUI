/**
 * File Info's Civitai part for a model file: the server hashes it (SHA256) and asks Civitai which
 * version it is. The match fills the image carousel, a panel with the model's details (creator,
 * version, base model, stats, trigger words, tags) and its description. Every piece reads the
 * same cached query, so they can sit in different columns.
 */
import { Icon } from "@client/icons/Icon";
import { useGoToView } from "@client/lib/hooks";
import { useCivitaiByHash, useSettings } from "@client/lib/queries";
import {
  Badge,
  Button,
  Carousel,
  Chip,
  Collapsible,
  CopyButton,
  Panel,
  PropertyList,
  toast,
} from "@client/ui";
import { CIVITAI_TYPE_LABELS, type CivitaiMatch, compactCount } from "@shared/civitai";
import type { ReactNode } from "react";
import { localVersions } from "../models/civitai/marks";
import { RichText } from "../models/civitai/RichText";
import { openCivitaiModel, useCivitai } from "../models/civitai/state";
import { useModelsNav } from "../models/nav";

function versionOf(match: NonNullable<CivitaiMatch>) {
  return match.model.versions.find((v) => v.id === match.versionId) ?? null;
}

/** The matched version's images, or `fallback` while there's no match (or no images). */
export function CivitaiImages({
  sha256,
  fallback,
}: {
  sha256: string | null;
  fallback: ReactNode;
}) {
  const match = useCivitaiByHash(sha256).data;
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  const images = match ? (versionOf(match)?.images ?? []) : [];
  if (!match || !images.length) return <>{fallback}</>;
  return <Carousel images={images} label={`${match.model.name} images`} blurNsfw={blurNsfw} />;
}

export function CivitaiMatchPanel({
  sha256,
  hashing,
  hashError,
}: {
  sha256: string | null;
  hashing: boolean;
  hashError: string | null;
}) {
  const q = useCivitaiByHash(sha256);
  const goTo = useGoToView();
  const setFilter = useCivitai((s) => s.setFilter);
  const show = useCivitai((s) => s.show);

  if (hashError) return <Note icon="errors" text={`Couldn't hash the file: ${hashError}`} />;
  if (hashing)
    return <Note busy text="Reading the whole file to find it on Civitai by its hash…" />;
  if (!sha256) return null;
  if (q.isLoading) return <Note busy text="Looking it up on Civitai…" />;
  if (q.error)
    return (
      <Note
        icon="errors"
        text={`Couldn't ask Civitai: ${q.error.message}`}
        action={
          <Button size="sm" onClick={() => void q.refetch()}>
            Try again
          </Button>
        }
      />
    );
  const match = q.data;
  if (!match)
    return (
      <Note
        icon="globe"
        text="Civitai doesn't know this file. It may be private, taken down, changed after download or from somewhere else."
      />
    );

  const { model } = match;
  const version = versionOf(match);
  const installed = localVersions(model.id, model.local, []).has(match.versionId);
  const openInModels = () => {
    openCivitaiModel(model.id, model.name);
    goTo("models");
  };
  const browse = (filter: { query: string; username: string }) => {
    setFilter(filter);
    show(null);
    useModelsNav.getState().setTab("civitai");
    goTo("models");
  };

  return (
    <Panel className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-fg">
          <Icon name="globe" size={16} className="text-accent-ink" />
          Found on Civitai
        </span>
        <Badge tone="accent">{CIVITAI_TYPE_LABELS[model.type] ?? model.type}</Badge>
        {version?.baseModel ? <Badge>{version.baseModel}</Badge> : null}
        {model.nsfw ? <Badge tone="warning">NSFW</Badge> : null}
        {installed ? (
          <Badge tone="success">
            <Icon name="check" size={11} /> In your models folder
          </Badge>
        ) : null}
        <span className="ml-auto flex items-center gap-3">
          <a
            href={model.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-sm text-accent-ink hover:underline"
          >
            {new URL(model.url).host}
            <Icon name="external" size={12} />
          </a>
          <Button variant="primary" icon="models" onClick={openInModels}>
            Open in Models
          </Button>
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <h2 className="text-xl font-semibold tracking-tight text-balance break-words text-fg">
          {model.name}
        </h2>
        {version ? <span className="text-sm text-fg-3">{version.name}</span> : null}
      </div>

      <PropertyList
        labelWidth={110}
        items={[
          {
            label: "Creator",
            value: model.creator ? (
              <button
                type="button"
                className="rounded-sm text-left hover:text-accent-ink focus-ring"
                title={`More from ${model.creator}`}
                onClick={() => browse({ username: model.creator ?? "", query: "" })}
              >
                {model.creator}
              </button>
            ) : null,
          },
          {
            label: "Published",
            value: version?.publishedAt ? new Date(version.publishedAt).toLocaleDateString() : null,
          },
          {
            label: "Downloads",
            value: version
              ? `${compactCount(version.downloads)} this version · ${compactCount(model.downloads)} in all`
              : compactCount(model.downloads),
          },
          { label: "Likes", value: compactCount(model.likes) },
          {
            label: "Versions",
            value: model.versions.length > 1 ? `${model.versions.length} on Civitai` : null,
          },
          {
            label: "Civitai ids",
            value: `model ${model.id} · version ${match.versionId}`,
            copy: String(match.versionId),
            mono: true,
          },
        ]}
      />

      {version?.trainedWords.length ? (
        <div className="flex flex-col gap-1.5">
          <span className="label-caps">Trigger words on Civitai</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {version.trainedWords.map((w) => (
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
            <CopyButton text={version.trainedWords.join(", ")} label="Copy all trigger words" />
          </div>
        </div>
      ) : null}

      {model.tags.length ? (
        <div className="flex flex-col gap-1.5">
          <span className="label-caps">Tags</span>
          <div className="flex flex-wrap gap-1">
            {model.tags.slice(0, 16).map((t) => (
              <Chip key={t} size="sm" icon="tag" onClick={() => browse({ query: t, username: "" })}>
                {t}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

/** The model's (and the version's) description from Civitai, folded. */
export function CivitaiAbout({ sha256 }: { sha256: string | null }) {
  const match = useCivitaiByHash(sha256).data;
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  if (!match) return null;
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

function Note({
  text,
  icon = "info",
  busy,
  action,
}: {
  text: string;
  icon?: "info" | "errors" | "globe";
  busy?: boolean;
  action?: ReactNode;
}) {
  return (
    <Panel className="flex items-center gap-3 px-5 py-4 text-sm text-fg-3">
      <Icon
        name={busy ? "refresh" : icon}
        size={16}
        className={busy ? "shrink-0 animate-spin text-accent-ink" : "shrink-0"}
      />
      <span className="flex-1">{text}</span>
      {action}
    </Panel>
  );
}
