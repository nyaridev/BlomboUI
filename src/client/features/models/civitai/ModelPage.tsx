/**
 * A Civitai model inside Blombo. Left: the version's images as File Info's endless carousel (the
 * wheel or a drag moves through them, a click on the middle one opens it full screen; NSFW ones
 * blurred until clicked), under it how the picked image was made as its poster shared it (a
 * fold, closed at first), then the model's description under a separator. Right, top to bottom: the header (badges, name, creator with
 * Follow, the Civitai link), the model's numbers, one card for the picked version (the picker,
 * its facts, Download with a preview of where the file lands, its files), trigger words, tags
 * and the version's notes (a fold). Descriptions are parsed on the server and rendered as plain
 * elements. Download opens
 * the download pop-up (DownloadDialog) to change the folder and file name first. Marks show
 * what's already in the models folder.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { useLive } from "@client/lib/live";
import { formatBytes } from "@client/lib/number";
import {
  useCivitaiModel,
  useCivitaiVersionImages,
  useDownloadPlan,
  useSettings,
} from "@client/lib/queries";
import {
  Badge,
  Button,
  Chip,
  Collapsible,
  CopyButton,
  EmptyState,
  FallbackFace,
  KIND_STYLE,
  Select,
  Skeleton,
} from "@client/ui";
import {
  CIVITAI_TYPE_LABELS,
  type CivitaiImageMeta,
  type CivitaiModel,
  type CivitaiVersion,
  compactCount,
} from "@shared/civitai";
import type { EnqueueBody } from "@shared/downloads";
import { type ReactNode, useMemo, useState } from "react";
import { DownloadRow } from "../../downloads/DownloadRow";
import { CivitaiCarousel } from "../../fileinfo/CivitaiCarousel";
import { ImageSettingsBody } from "../../fileinfo/CivitaiMatch";
import { useModelsNav } from "../nav";
import { NsfwBlurToggle } from "./Browse";
import { DownloadDialog } from "./DownloadDialog";
import { FollowButton } from "./follow";
import { localVersions } from "./marks";
import { RichText } from "./RichText";
import { useCivitai } from "./state";

/** The two columns: the images take what the 400 px info column leaves; one column when narrow. */
const COLUMNS =
  "mx-auto grid max-w-[1360px] grid-cols-[minmax(0,1fr)_400px] gap-8 px-6 max-[1000px]:grid-cols-1 max-lg:px-3";

export function ModelPage({ id, versionId }: { id: number; versionId?: number }) {
  const q = useCivitaiModel(id);
  const blurNsfw = useCivitai((s) => s.blur);
  if (q.isLoading)
    return (
      <div className={`${COLUMNS} pt-6`}>
        <Skeleton className="aspect-[4/5] max-h-[calc(100vh-212px)] w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
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
  const [shown, setShown] = useState(0);
  // The model answer's images don't say who posted them or how they were made; the version's
  // own answer does. Matched by picture, so the carousel keeps its place when it arrives.
  const detailed = useCivitaiVersionImages(version?.id ?? null).data;
  const details = useMemo(() => new Map((detailed ?? []).map((i) => [i.thumb, i])), [detailed]);
  const shownImage = images[shown] ?? null;
  const current = shownImage ? (details.get(shownImage.thumb) ?? shownImage) : null;

  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className={`${COLUMNS} pt-6 pb-14 max-lg:pt-3`}>
        {/* One column (narrow): its pieces join the grid, so the description can go last. */}
        <div className="flex min-w-0 flex-col gap-4 max-[1000px]:contents">
          {images.length ? (
            <CivitaiCarousel
              images={images}
              label={`${model.name} images`}
              onIndex={setShown}
              blurNsfw={blurNsfw}
              // Shorter than the window, so the page still scrolls beside it (the wheel over it
              // changes the image) and the picked image's settings show under it.
              height="h-[min(64vh,680px)] max-lg:h-[52vh]"
            />
          ) : (
            <div className="h-[min(64vh,680px)] overflow-hidden rounded-xl border border-line bg-sunken max-lg:h-[52vh]">
              <FallbackFace name={model.name} kind={model.kind ?? "checkpoints"} />
            </div>
          )}
          {current ? (
            // One fold for every image, so it stays open (or closed) while you go through them.
            <Collapsible
              title="Image generation"
              icon="sparkle"
              tone="civitai"
              subtitle={current.meta ? settingsSummary(current.meta) : "Not shared by its poster"}
            >
              {current.meta ? (
                <ImageSettingsBody meta={current.meta} />
              ) : (
                <p className="text-sm text-fg-3">
                  {current.by ? `${current.by} didn't` : "The poster didn't"} share how this image
                  was made.
                </p>
              )}
            </Collapsible>
          ) : null}
          {model.description.length ? (
            <section className="mt-4 flex min-w-0 flex-col gap-4 max-[1000px]:order-last max-[1000px]:mt-0">
              <div className="flex items-center gap-3">
                <Icon name="file-text" size={15} className="shrink-0 text-fg-3" />
                <h3 className="text-base font-semibold text-fg">About this model</h3>
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="max-w-[72ch]">
                <RichText blocks={model.description} blurImages={model.nsfw && blurNsfw} />
              </div>
            </section>
          ) : null}
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <header className="flex flex-col gap-2.5">
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
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-fg-2">
              {model.creator ? (
                <>
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-1.5 rounded-sm hover:text-fg focus-ring"
                    title={`${model.creator}'s models (in Following)`}
                    onClick={() => {
                      if (model.creator) visit(model.creator);
                    }}
                  >
                    {model.creatorImage ? (
                      <img
                        src={model.creatorImage}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <Icon name="user" size={15} className="shrink-0" />
                    )}
                    <span className="truncate">{model.creator}</span>
                  </button>
                  <FollowButton name={model.creator} image={model.creatorImage} />
                </>
              ) : null}
              <a
                href={model.url}
                target="_blank"
                rel="noreferrer noopener"
                className="ml-auto inline-flex items-center gap-1 rounded-sm text-xs text-accent-ink hover:underline focus-ring"
              >
                Open on {new URL(model.url).host}
                <Icon name="external" size={12} />
              </a>
            </div>
          </header>

          <dl className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface-2">
            <Stat icon="download" label="Downloads" value={compactCount(model.downloads)} />
            <Stat icon="heart" label="Likes" value={compactCount(model.likes)} />
            <Stat
              icon="layers"
              label={model.versions.length === 1 ? "Version" : "Versions"}
              value={String(model.versions.length)}
            />
          </dl>

          {version ? (
            <section className="flex flex-col rounded-lg border border-line bg-surface-2">
              <div className="flex flex-col gap-3 p-3.5">
                <div className="flex items-center gap-2">
                  <h3 className="label-caps">Version</h3>
                  {version.earlyAccess ? <Badge tone="warning">Early access</Badge> : null}
                </div>
                {model.versions.length > 1 ? (
                  <Select
                    label="Version"
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
                ) : (
                  <span className="text-sm font-medium text-fg">{version.name}</span>
                )}
                <dl className="grid grid-cols-3 gap-x-4 gap-y-2">
                  <Fact label="Base model">{version.baseModel ?? "—"}</Fact>
                  <Fact label="Published">
                    {version.publishedAt
                      ? new Date(version.publishedAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </Fact>
                  <Fact label="Downloads">{compactCount(version.downloads)}</Fact>
                </dl>
              </div>
              <div className="border-t border-line p-3.5">
                <DownloadPanel model={model} version={version} />
              </div>
            </section>
          ) : null}

          {version?.trainedWords.length ? (
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h3 className="flex-1 label-caps">Trigger words</h3>
                <CopyButton text={version.trainedWords.join(", ")} label="Copy all trigger words" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {version.trainedWords.map((w) => (
                  <span
                    key={w}
                    className="inline-flex h-7 max-w-full min-w-0 items-center gap-0.5 rounded-md border border-line bg-field pr-0.5 pl-2 text-fg"
                  >
                    <span className="truncate font-mono text-xs">{w}</span>
                    <CopyButton text={w} label={`Copy "${w}"`} />
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {model.tags.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="label-caps">Tags</h3>
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
            </section>
          ) : null}

          {version?.description.length ? (
            <Collapsible
              key={version.id}
              title={`About ${version.name}`}
              icon="info"
              subtitle="The creator's notes on this version"
            >
              <RichText blocks={version.description} blurImages={model.nsfw && blurNsfw} />
            </Collapsible>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** One of the model's numbers: a tile in the stats row. */
function Stat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
      <dt className="flex items-center gap-1 text-2xs text-fg-3">
        <Icon name={icon} size={11} />
        {label}
      </dt>
      <dd className="truncate text-base font-semibold text-fg tabular">{value}</dd>
    </div>
  );
}

/** A fact about the picked version. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-fg-3">{label}</dt>
      <dd className="truncate text-sm text-fg tabular">{children}</dd>
    </div>
  );
}

/** "Euler a · 28 steps · CFG 6": a fold's one-line summary of an image's settings. */
function settingsSummary(meta: CivitaiImageMeta): string {
  const get = (label: string) => meta.settings.find(([l]) => l === label)?.[1];
  const steps = get("Steps");
  const cfg = get("CFG");
  const parts = [get("Sampler"), steps ? `${steps} steps` : null, cfg ? `CFG ${cfg}` : null];
  const shown = parts.filter(Boolean).join(" · ");
  return shown || (meta.prompt ? "Prompt shared" : "Settings shared");
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
    <div className="flex flex-col gap-3">
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
          <span className="label-caps">{version.files.length > 1 ? "Files" : "File"}</span>
          {version.files.map((f) => (
            <div key={f.id} className="flex items-center gap-2.5 px-0.5 py-1">
              <Icon name="file" size={14} className="shrink-0 text-fg-3" />
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
