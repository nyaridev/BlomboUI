/**
 * A Civitai model inside Blombo: image carousel, version picker, files, trigger words with copy,
 * the description (parsed on the server, rendered as plain elements), and Download with a
 * preview of where the file lands; Download opens the download pop-up (DownloadDialog) to change
 * the folder and file name first. Marks show what's already in the models folder.
 */
import { Icon } from "@client/icons/Icon";
import { useLive } from "@client/lib/live";
import { formatBytes } from "@client/lib/number";
import { useCivitaiModel, useDownloadPlan, useSettings } from "@client/lib/queries";
import {
  Badge,
  Button,
  Carousel,
  Chip,
  CopyButton,
  EmptyState,
  FallbackFace,
  Field,
  KIND_STYLE,
  Select,
  Skeleton,
  toast,
} from "@client/ui";
import {
  CIVITAI_TYPE_LABELS,
  type CivitaiModel,
  type CivitaiVersion,
  compactCount,
} from "@shared/civitai";
import type { EnqueueBody } from "@shared/downloads";
import { useMemo, useState } from "react";
import { DownloadRow } from "../../downloads/DownloadRow";
import { useModelsNav } from "../nav";
import { NsfwBlurToggle } from "./Browse";
import { DownloadDialog } from "./DownloadDialog";
import { FollowButton } from "./follow";
import { localVersions } from "./marks";
import { RichText } from "./RichText";
import { useCivitai } from "./state";

export function ModelPage({ id, versionId }: { id: number; versionId?: number }) {
  const q = useCivitaiModel(id);
  const blurNsfw = useCivitai((s) => s.blur);
  if (q.isLoading)
    return (
      <div className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_400px] gap-8 p-6">
        <Skeleton className="aspect-[4/5]" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  if (q.error || !q.data)
    return (
      <EmptyState
        icon="globe"
        tone="warning"
        title="Couldn't open this model"
        text={q.error?.message ?? "Civitai didn't answer."}
        action={<Button onClick={() => void q.refetch()}>Try again</Button>}
      />
    );
  return <Page model={q.data} blurNsfw={blurNsfw} openOn={versionId} />;
}

function Page({
  model,
  blurNsfw,
  openOn,
}: {
  model: CivitaiModel;
  blurNsfw: boolean;
  /** The version to show first (the card's); the newest when it isn't there. */
  openOn?: number;
}) {
  const [versionId, setVersionId] = useState(
    model.versions.some((v) => v.id === openOn) ? (openOn as number) : (model.versions[0]?.id ?? 0),
  );
  const version = model.versions.find((v) => v.id === versionId) ?? model.versions[0];
  const downloads = useLive((s) => s.downloads);
  const showMarks = useSettings().data?.civitai.marks ?? true;
  const local = useMemo(
    () => localVersions(model.id, model.local, downloads),
    [model.id, model.local, downloads],
  );
  const setFilter = useCivitai((s) => s.setFilter);
  const showHome = useCivitai((s) => s.showHome);
  const visit = useCivitai((s) => s.visit);
  const style = model.kind ? KIND_STYLE[model.kind] : null;
  const images = useMemo(() => version?.images ?? [], [version]);

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_400px] gap-8 px-6 pt-6 max-[1000px]:grid-cols-1">
        <div className="min-w-0">
          <Carousel
            images={images}
            label={`${model.name} images`}
            blurNsfw={blurNsfw}
            className="sticky top-0"
            empty={<FallbackFace name={model.name} kind={model.kind ?? "checkpoints"} />}
          />
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">
                {style ? <Icon name={style.icon} size={11} /> : null}
                {CIVITAI_TYPE_LABELS[model.type] ?? model.type}
              </Badge>
              {version?.baseModel ? <Badge>{version.baseModel}</Badge> : null}
              {model.nsfw ? <Badge tone="warning">NSFW</Badge> : null}
              {showMarks && version && local.has(version.id) ? (
                <Badge tone="success">
                  <Icon name="check" size={11} /> Installed
                </Badge>
              ) : showMarks && local.size ? (
                <Badge tone="warning">
                  <Icon name="layers" size={11} /> Other version installed
                </Badge>
              ) : null}
              <span className="ml-auto">
                <NsfwBlurToggle />
              </span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-balance break-words text-fg">
              {model.name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-3">
              {model.creator ? (
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-sm hover:text-fg focus-ring"
                  title={`${model.creator}'s models (in Following)`}
                  onClick={() => {
                    if (model.creator) visit(model.creator);
                  }}
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
              {model.creator ? (
                <FollowButton name={model.creator} image={model.creatorImage} />
              ) : null}
              <span className="flex items-center gap-1 tabular" title="Downloads">
                <Icon name="download" size={13} />
                {compactCount(model.downloads)}
              </span>
              <span className="flex items-center gap-1 tabular" title="Likes">
                <Icon name="heart" size={13} />
                {compactCount(model.likes)}
              </span>
              <a
                href={model.url}
                target="_blank"
                rel="noreferrer noopener"
                className="ml-auto inline-flex items-center gap-1 text-accent-ink hover:underline"
              >
                {new URL(model.url).host}
                <Icon name="external" size={12} />
              </a>
            </div>
          </div>

          {model.versions.length > 1 ? (
            <Field label="Version">
              <Select
                value={String(versionId)}
                onChange={(v) => setVersionId(Number(v))}
                options={model.versions.map((v) => ({
                  value: String(v.id),
                  label: v.name,
                  icon: local.has(v.id) ? "check-circle" : undefined,
                  hint: [v.baseModel, local.has(v.id) ? "installed" : null]
                    .filter(Boolean)
                    .join(" · "),
                }))}
              />
            </Field>
          ) : null}

          {version ? <DownloadPanel model={model} version={version} /> : null}

          {version?.trainedWords.length ? (
            <div className="flex flex-col gap-1.5">
              <span className="label-caps">Trigger words</span>
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
                  <Chip
                    key={t}
                    size="sm"
                    icon="tag"
                    onClick={() => {
                      setFilter({ query: t, username: "" });
                      showHome("browse");
                    }}
                  >
                    {t}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
      <div className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_400px] gap-8 px-6 pt-8 pb-14 max-[1000px]:grid-cols-1">
        <section className="flex min-w-0 flex-col gap-3">
          <h3 className="label-caps">About this model</h3>
          <RichText blocks={model.description} blurImages={model.nsfw && blurNsfw} />
        </section>
        {version?.description.length ? (
          <section className="flex min-w-0 flex-col gap-3">
            <h3 className="label-caps">About {version.name}</h3>
            <RichText blocks={version.description} blurImages={model.nsfw && blurNsfw} />
          </section>
        ) : null}
      </div>
    </div>
  );
}

/* ── download ───────────────────────────────────────────────────────────── */

function DownloadPanel({ model, version }: { model: CivitaiModel; version: CivitaiVersion }) {
  const primary = version.files.find((f) => f.primary) ?? version.files[0];
  const [asking, setAsking] = useState(false);
  // Where the primary file would go with the automatic sorting; the pop-up changes it.
  const body: EnqueueBody | null = primary
    ? { source: "civitai", modelId: model.id, versionId: version.id, fileId: primary.id }
    : null;
  const plan = useDownloadPlan(body);
  const live = useLive((s) =>
    s.downloads.find(
      (d) => d.versionId === version.id && d.state !== "cancelled" && d.state !== "done",
    ),
  );
  const p = plan.data;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3.5">
      {live ? (
        <div className="-mx-3.5 -my-1">
          <DownloadRow d={live} dense />
        </div>
      ) : (
        <Button
          variant="primary"
          size="lg"
          icon="download"
          disabled={!primary}
          onClick={() => setAsking(true)}
        >
          {p?.installed ? "Download again" : "Download"}
          {primary?.size ? (
            <span className="font-normal opacity-75">· {formatBytes(primary.size)}</span>
          ) : null}
        </Button>
      )}
      {plan.isLoading ? (
        <Skeleton className="h-4 w-3/4" />
      ) : plan.error ? (
        <p className="text-xs text-danger">{plan.error.message}</p>
      ) : p ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <Icon name="folder" size={14} className="mt-0.5 shrink-0 text-fg-3" />
            <span className="min-w-0 flex-1 font-mono text-2xs break-all text-fg-2" title={p.path}>
              {[p.kindFolder, p.folder, p.file].filter(Boolean).join("/")}
            </span>
          </div>
          {p.blocked ? (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <Icon name="info" size={13} className="mt-px shrink-0" />
              {p.blocked}
            </p>
          ) : null}
          {p.installed ? (
            <p className="flex items-start gap-1.5 text-xs text-success">
              <Icon name="check-circle" size={13} className="mt-px shrink-0" />
              <span className="min-w-0">
                Already in your models folder:{" "}
                <button
                  type="button"
                  className="font-mono break-all underline-offset-2 hover:underline focus-ring"
                  onClick={() => {
                    useModelsNav.getState().showLocal(p.installed ?? "");
                  }}
                >
                  {p.installed}
                </button>
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
      {version.files.length ? (
        <div className="flex flex-col gap-1">
          {version.files.length > 1 ? <span className="label-caps">Files</span> : null}
          {version.files.map((f) => (
            <div key={f.id} className="flex items-center gap-2.5 px-0.5 py-1">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-fg" title={f.name}>
                  {f.name}
                </span>
                <span className="text-2xs text-fg-3">
                  {[f.type, f.format, f.fp, f.size ? formatBytes(f.size) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {f.safe === false ? (
                <Badge tone="danger">Scan failed</Badge>
              ) : f.safe === null ? (
                <Badge tone="warning">Not scanned</Badge>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <span className="text-xs text-fg-3">This version has no files to download.</span>
      )}
      <DownloadDialog
        modelId={asking ? model.id : null}
        versionId={version.id}
        onClose={() => setAsking(false)}
      />
    </div>
  );
}
