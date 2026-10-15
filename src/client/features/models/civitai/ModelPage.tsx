/**
 * A Civitai model inside Blombo: image carousel, version picker, files, trigger words with copy,
 * the description (parsed on the server, rendered as plain elements), and Download with a
 * preview of exactly where the file will land. Marks show what's already in the models folder.
 */
import { Icon } from "@client/icons/Icon";
import { useGoToView } from "@client/lib/hooks";
import { useLive } from "@client/lib/live";
import { formatBytes } from "@client/lib/number";
import {
  useCivitaiAccount,
  useCivitaiModel,
  useDownloadPlan,
  useSettings,
  useStartDownload,
} from "@client/lib/queries";
import {
  Badge,
  Button,
  Carousel,
  Chip,
  CopyButton,
  EmptyState,
  FallbackFace,
  Field,
  IconButton,
  KIND_STYLE,
  Popover,
  Select,
  Skeleton,
  TextField,
  toast,
} from "@client/ui";
import {
  CIVITAI_TYPE_LABELS,
  type CivitaiModel,
  type CivitaiVersion,
  compactCount,
} from "@shared/civitai";
import { MODEL_KINDS, type ModelKind } from "@shared/constants";
import type { EnqueueBody } from "@shared/downloads";
import { useEffect, useMemo, useState } from "react";
import { DownloadRow } from "../../downloads/DownloadRow";
import { useSettingsNav } from "../../settings/nav";
import { useModelsNav } from "../nav";
import { localVersions } from "./marks";
import { RichText } from "./RichText";
import { useCivitai } from "./state";

export function ModelPage({ id }: { id: number }) {
  const q = useCivitaiModel(id);
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
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
  return <Page model={q.data} blurNsfw={blurNsfw} />;
}

function Page({ model, blurNsfw }: { model: CivitaiModel; blurNsfw: boolean }) {
  const [versionId, setVersionId] = useState(model.versions[0]?.id ?? 0);
  const version = model.versions.find((v) => v.id === versionId) ?? model.versions[0];
  const downloads = useLive((s) => s.downloads);
  const showMarks = useSettings().data?.civitai.marks ?? true;
  const local = useMemo(
    () => localVersions(model.id, model.local, downloads),
    [model.id, model.local, downloads],
  );
  const setFilter = useCivitai((s) => s.setFilter);
  const show = useCivitai((s) => s.show);
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
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-balance break-words text-fg">
              {model.name}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-3">
              {model.creator ? (
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-sm hover:text-fg focus-ring"
                  title={`More from ${model.creator}`}
                  onClick={() => {
                    setFilter({ username: model.creator ?? "", query: "" });
                    show(null);
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
                civitai.com
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
                      show(null);
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
  const [fileId, setFileId] = useState<number | null>(primary?.id ?? null);
  const [kind, setKind] = useState<ModelKind | undefined>(undefined);
  const [folder, setFolder] = useState<string | undefined>(undefined);
  const account = useCivitaiAccount().data;
  const goTo = useGoToView();
  // Another version or model: back to its primary file and the automatic folder.
  useEffect(() => {
    setFileId(primary?.id ?? null);
    setKind(undefined);
    setFolder(undefined);
  }, [primary?.id]);
  const body: EnqueueBody | null = fileId
    ? {
        source: "civitai",
        modelId: model.id,
        versionId: version.id,
        fileId,
        ...(kind ? { kind } : {}),
        ...(folder !== undefined ? { folder } : {}),
      }
    : null;
  const plan = useDownloadPlan(body);
  const start = useStartDownload();
  const live = useLive((s) =>
    s.downloads.find(
      (d) => d.versionId === version.id && d.state !== "cancelled" && d.state !== "done",
    ),
  );
  const file = version.files.find((f) => f.id === fileId);
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
          loading={start.isPending}
          disabled={!body || !p || Boolean(p.blocked)}
          onClick={() => {
            if (!body) return;
            start.mutate(body, {
              onSuccess: (d) => toast(`Downloading ${d.name}`, "info"),
              onError: (e) => toast(e.message, "error"),
            });
          }}
        >
          {p?.installed ? "Download again" : "Download"}
          {file?.size ? (
            <span className="font-normal opacity-75">· {formatBytes(file.size)}</span>
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
            <Popover
              placement="bottom-end"
              className="w-80 p-3"
              trigger={<IconButton icon="edit" label="Change where it goes" size="xs" />}
            >
              <div className="flex flex-col gap-3">
                <Field label="Kind folder">
                  <Select<ModelKind>
                    value={p.kind}
                    onChange={setKind}
                    options={MODEL_KINDS.map((k) => ({
                      value: k,
                      label: KIND_STYLE[k].label,
                      icon: KIND_STYLE[k].icon,
                    }))}
                  />
                </Field>
                <Field label="Subfolder" hint="Use / for nested folders. Empty: the kind folder.">
                  {(fid) => (
                    <TextField
                      id={fid}
                      mono
                      icon="folder"
                      value={folder ?? p.folder}
                      onChange={(e) => setFolder(e.target.value)}
                    />
                  )}
                </Field>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="undo"
                  disabled={kind === undefined && folder === undefined}
                  onClick={() => {
                    setKind(undefined);
                    setFolder(undefined);
                  }}
                >
                  Back to automatic sorting
                </Button>
              </div>
            </Popover>
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
          ) : p.nameTaken ? (
            <p className="text-xs text-fg-3">
              A different file already has that name; this one is saved next to it as "
              {p.file.replace(/(\.[^.]+)$/, " (2)$1")}".
            </p>
          ) : null}
          {version.earlyAccess && !account?.keySet ? (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <Icon name="lock" size={13} className="mt-px shrink-0" />
              <span>
                Early access: Civitai needs your API key for this version.{" "}
                <button
                  type="button"
                  className="text-accent-ink hover:underline focus-ring"
                  onClick={() => {
                    useSettingsNav.getState().go("civitai");
                    goTo("settings");
                  }}
                >
                  Add it in Settings → Civitai
                </button>
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
      {version.files.length > 1 ? (
        <div className="flex flex-col gap-1">
          <span className="label-caps">Files</span>
          {version.files.map((f) => (
            <label
              key={f.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-field has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
            >
              <input
                type="radio"
                name={`file-${version.id}`}
                checked={fileId === f.id}
                onChange={() => setFileId(f.id)}
                className="accent-[var(--accent)]"
              />
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
            </label>
          ))}
        </div>
      ) : file ? (
        <span className="text-2xs text-fg-3">
          {[file.name, file.format, file.fp].filter(Boolean).join(" · ")}
          {file.safe === false ? " · failed Civitai's safety scan" : ""}
        </span>
      ) : (
        <span className="text-xs text-fg-3">This version has no files to download.</span>
      )}
    </div>
  );
}
