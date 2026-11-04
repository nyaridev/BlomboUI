/**
 * The download pop-up: everything about where a Civitai file lands, before it starts. Opens from
 * a model page's Download and from a double click on a Browse card. Pick the version and file,
 * then the kind folder, the subfolder and the file name, all filled in from Settings → Civitai
 * (sorting, the author's prefix); the full path underneath follows every change (the server's
 * plan, the same one the download uses). Download queues it and closes.
 */
import { Icon } from "@client/icons/Icon";
import { useGoToView } from "@client/lib/hooks";
import { formatBytes } from "@client/lib/number";
import {
  useCivitaiAccount,
  useCivitaiModel,
  useDownloadPlan,
  useStartDownload,
} from "@client/lib/queries";
import {
  Badge,
  Button,
  Dialog,
  Field,
  KIND_STYLE,
  Select,
  Skeleton,
  TextField,
  toast,
} from "@client/ui";
import type { CivitaiModel } from "@shared/civitai";
import { MODEL_KINDS, type ModelKind } from "@shared/constants";
import type { EnqueueBody } from "@shared/downloads";
import { useEffect, useState } from "react";
import { useSettingsNav } from "../../settings/nav";
import { useModelsNav } from "../nav";

const stemOf = (file: string) => file.replace(/\.[^.]+$/, "");

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function DownloadDialog({
  modelId,
  versionId,
  onClose,
}: {
  /** The model to download from; null keeps it closed. */
  modelId: number | null;
  /** The version to start on (the newest when left out). */
  versionId?: number;
  onClose: () => void;
}) {
  const q = useCivitaiModel(modelId);
  const model = q.data;
  return (
    <Dialog
      open={modelId !== null}
      onOpenChange={(o) => !o && onClose()}
      title={model ? `Download ${model.name}` : "Download"}
      width={560}
    >
      {model ? (
        <Body key={model.id} model={model} versionId={versionId} onClose={onClose} />
      ) : q.error ? (
        <p className="text-sm text-danger">{q.error.message}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      )}
    </Dialog>
  );
}

function Body({
  model,
  versionId,
  onClose,
}: {
  model: CivitaiModel;
  versionId?: number;
  onClose: () => void;
}) {
  const [vid, setVid] = useState(versionId ?? model.versions[0]?.id ?? 0);
  const version = model.versions.find((v) => v.id === vid) ?? model.versions[0];
  const primary = version?.files.find((f) => f.primary) ?? version?.files[0];
  const [fileId, setFileId] = useState<number | null>(primary?.id ?? null);
  // undefined: what Settings → Civitai would pick.
  const [kind, setKind] = useState<ModelKind | undefined>(undefined);
  const [folder, setFolder] = useState<string | undefined>(undefined);
  const [name, setName] = useState<string | undefined>(undefined);
  const account = useCivitaiAccount().data;
  const goTo = useGoToView();
  const start = useStartDownload();
  // Another version: its primary file.
  useEffect(() => setFileId(primary?.id ?? null), [primary?.id]);

  const typedFolder = useDebounced(folder, 250);
  const typedName = useDebounced(name, 250);
  const body: EnqueueBody | null =
    version && fileId
      ? {
          source: "civitai",
          modelId: model.id,
          versionId: version.id,
          fileId,
          ...(kind ? { kind } : {}),
          ...(typedFolder !== undefined ? { folder: typedFolder } : {}),
          ...(typedName?.trim() ? { name: typedName.trim() } : {}),
        }
      : null;
  const plan = useDownloadPlan(body);
  const p = plan.data;
  const file = version?.files.find((f) => f.id === fileId);
  const ext = p?.file.slice(stemOf(p.file).length) ?? "";
  const changed = kind !== undefined || folder !== undefined || name !== undefined;

  const download = () => {
    if (!body) return;
    // What's typed right now, even within the debounce.
    const now: EnqueueBody = {
      ...body,
      ...(folder !== undefined ? { folder } : {}),
      ...(name?.trim() ? { name: name.trim() } : {}),
    };
    start.mutate(now, {
      onSuccess: (d) => {
        toast(`Downloading ${d.name}`, "info");
        onClose();
      },
      onError: (e) => toast(e.message, "error"),
    });
  };

  if (!version) return <p className="text-sm text-fg-3">This model has no versions to download.</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <Field label="Version">
          <Select<string>
            value={String(version.id)}
            onChange={(v) => setVid(Number(v))}
            options={model.versions.map((v) => ({
              value: String(v.id),
              label: v.name,
              hint: v.baseModel ?? undefined,
            }))}
          />
        </Field>
        <Field label="Kind folder">
          <Select<ModelKind>
            value={p?.kind ?? kind ?? null}
            onChange={setKind}
            placeholder="Pick a folder"
            options={MODEL_KINDS.map((k) => ({
              value: k,
              label: KIND_STYLE[k].label,
              icon: KIND_STYLE[k].icon,
            }))}
          />
        </Field>
      </div>
      {version.files.length > 1 ? (
        <Field label="File">
          <Select<string>
            value={fileId ? String(fileId) : null}
            onChange={(v) => setFileId(Number(v))}
            options={version.files.map((f) => ({
              value: String(f.id),
              label: f.name,
              hint: [f.fp, f.size ? formatBytes(f.size) : null].filter(Boolean).join(" · "),
            }))}
          />
        </Field>
      ) : null}
      <Field
        label="Subfolder"
        hint="Inside the kind folder. Use / for nested folders; empty: the kind folder itself."
      >
        {(id) => (
          <TextField
            id={id}
            mono
            icon="folder"
            value={folder ?? p?.folder ?? ""}
            onChange={(e) => setFolder(e.target.value)}
          />
        )}
      </Field>
      <Field
        label="File name"
        hint="The author's prefix and your naming setting are already applied."
      >
        {(id) => (
          <TextField
            id={id}
            mono
            icon="file"
            value={name ?? (p ? stemOf(p.file) : "")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && p && !p.blocked && download()}
            trailing={<span className="font-mono text-xs text-fg-3">{ext}</span>}
          />
        )}
      </Field>

      <div className="flex flex-col gap-1.5 rounded-md border border-line bg-sunken px-3 py-2.5">
        <span className="label-caps">Saved as</span>
        {plan.isLoading && !p ? (
          <Skeleton className="h-4 w-3/4" />
        ) : plan.error ? (
          <p className="text-xs text-danger">{plan.error.message}</p>
        ) : p ? (
          <span className="font-mono text-xs break-all text-fg" title={p.path}>
            {p.path}
          </span>
        ) : null}
        {p?.blocked ? (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <Icon name="info" size={13} className="mt-px shrink-0" />
            {p.blocked}
          </p>
        ) : null}
        {p?.installed ? (
          <p className="flex items-start gap-1.5 text-xs text-success">
            <Icon name="check-circle" size={13} className="mt-px shrink-0" />
            <span className="min-w-0">
              Already in your models folder:{" "}
              <button
                type="button"
                className="font-mono break-all underline-offset-2 hover:underline focus-ring"
                onClick={() => {
                  useModelsNav.getState().showLocal(p.installed ?? "");
                  onClose();
                }}
              >
                {p.installed}
              </button>
            </span>
          </p>
        ) : p?.nameTaken ? (
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
                  onClose();
                }}
              >
                Add it in Settings → Civitai
              </button>
            </span>
          </p>
        ) : null}
        {file?.safe === false ? (
          <Badge tone="danger">This file failed Civitai's safety scan</Badge>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          icon="undo"
          disabled={!changed}
          onClick={() => {
            setKind(undefined);
            setFolder(undefined);
            setName(undefined);
          }}
        >
          Back to automatic
        </Button>
        <Button variant="ghost" className="ml-auto" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          icon="download"
          loading={start.isPending}
          disabled={!body || !p || Boolean(p.blocked) || plan.isFetching}
          onClick={download}
        >
          {p?.installed ? "Download again" : "Download"}
          {file?.size ? (
            <span className="font-normal opacity-75">· {formatBytes(file.size)}</span>
          ) : null}
        </Button>
      </div>
    </div>
  );
}
