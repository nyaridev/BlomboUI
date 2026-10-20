/**
 * The Generate screen for a batch workflow (background removal, upscale, captioning, dataset
 * prep, or any graph with an input image and no sampler): the workflow's parameters on the left,
 * the batch runner on the right. Pick a folder or files, an output folder, run; each file is one
 * job in the server queue, and its progress, outputs and errors come over the live bus (`batch`).
 */
import { FolderField } from "@client/features/profiles/FolderField";
import { Icon, type IconName } from "@client/icons/Icon";
import { api } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { followTopic, useLive } from "@client/lib/live";
import { useBatchCheck, useBatchSnapshot } from "@client/lib/queries";
import {
  Badge,
  Button,
  DropZone,
  Field,
  Notice,
  Panel,
  ProgressBar,
  Segmented,
  Switch,
  TextField,
  toast,
} from "@client/ui";
import type { StagedFile } from "@shared/batch";
import { BATCH_IMAGE_EXTENSIONS, type BatchItem, type BatchRun, batchCounts } from "@shared/batch";
import type { WorkflowDetail } from "@shared/workflow/manifest";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProblemNotice } from "../blocks/stages/common";
import { ParamsColumn } from "../ParamsColumn";
import { takePendingSave, useValues } from "../state";

const ACCEPT = BATCH_IMAGE_EXTENSIONS.join(",");

const STATE: Record<BatchItem["state"], { icon: IconName; label: string; ink: string }> = {
  queued: { icon: "clock", label: "Waiting", ink: "text-fg-4" },
  running: { icon: "play", label: "Running", ink: "text-accent-ink" },
  done: { icon: "check-circle", label: "Done", ink: "text-success" },
  skipped: { icon: "skip", label: "Already done", ink: "text-fg-3" },
  error: { icon: "x-circle", label: "Failed", ink: "text-danger" },
  cancelled: { icon: "stop", label: "Stopped", ink: "text-fg-3" },
};

/** "D:\\shots" → "D:\\shots\\caption". */
function joinPath(folder: string, name: string): string {
  const sep = folder.includes("\\") ? "\\" : "/";
  return `${folder.replace(/[\\/]+$/, "")}${sep}${name}`;
}

export function BatchView({ manifest }: { manifest: WorkflowDetail }) {
  return (
    <div className="flex h-full min-h-0 gap-3 p-3">
      <ParamsColumn batch />
      <BatchPanel manifest={manifest} />
    </div>
  );
}

function BatchPanel({ manifest }: { manifest: WorkflowDetail }) {
  useEffect(() => followTopic("batch"), []);
  const initial = useBatchSnapshot();
  const live = useLive((s) => s.batch);
  const run = live ?? initial.data?.run ?? null;
  const check = useBatchCheck(manifest.id);
  const comfy = useLive((s) => s.comfy?.state ?? null);

  const [source, setSource] = useState<"folder" | "files">("folder");
  const [folder, setFolder] = useState("");
  const [recursive, setRecursive] = useState(false);
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [output, setOutput] = useState("");
  const [outputTouched, setOutputTouched] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [prefix, setPrefix] = useState("");
  const [staging, setStaging] = useState(0);
  const [starting, setStarting] = useState(false);

  const textOnly = check.data ? !check.data.makesImages && check.data.makesText : false;
  // Results next to the inputs for captions; in a subfolder named after the workflow otherwise.
  useEffect(() => {
    if (outputTouched || source !== "folder" || !folder.trim()) return;
    setOutput(textOnly ? folder.trim() : joinPath(folder.trim(), manifest.id));
  }, [folder, source, textOnly, manifest.id, outputTouched]);

  const mine = run && run.workflowId === manifest.id ? run : null;
  const running = run?.state === "running";
  const problems = check.data?.problems ?? [];
  const ready =
    (source === "folder" ? folder.trim() !== "" : files.length > 0) &&
    output.trim() !== "" &&
    staging === 0 &&
    !running;

  const addFiles = async (picked: File[]) => {
    setStaging((n) => n + picked.length);
    for (const f of picked) {
      try {
        const staged = await api.stageBatchFile(f);
        setFiles((list) => (list.some((x) => x.path === staged.path) ? list : [...list, staged]));
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), "error");
      } finally {
        setStaging((n) => n - 1);
      }
    }
  };

  const chooseFiles = async () => {
    const res = await api.pickImages("Choose images for the batch");
    if (!res.paths.length) return;
    setFiles((list) => {
      const known = new Set(list.map((f) => f.path));
      const added = res.paths
        .filter((p) => !known.has(p))
        .map((p) => ({ path: p, name: p.split(/[\\/]/).pop() ?? p }));
      return [...list, ...added];
    });
  };

  const start = async () => {
    setStarting(true);
    takePendingSave();
    try {
      await api.startBatch({
        workflowId: manifest.id,
        values: useValues.getState().values,
        source:
          source === "folder"
            ? { type: "folder", folder: folder.trim(), recursive }
            : { type: "files", files },
        output: output.trim(),
        skipExisting,
        captionPrefix: prefix,
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Panel className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-field text-fg-2">
          <Icon name="stack" size={17} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 text-sm font-medium text-fg">
            {manifest.name}
            <Badge tone="accent">batch</Badge>
          </span>
          <span className="text-xs text-fg-3">
            {manifest.description ??
              "Runs this workflow once for every image, into the output folder."}
          </span>
        </div>
      </div>

      <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        {problems.map((p) => (
          <ProblemNotice key={p.message} problem={p} />
        ))}
        {check.data && !check.data.checked ? (
          <Notice tone="info">
            Start ComfyUI to check what this workflow needs. Batches wait for it.
          </Notice>
        ) : null}

        <Field label="Images" layout="left">
          <div className="flex flex-col gap-2.5">
            <Segmented
              size="sm"
              label="Images from"
              value={source}
              onChange={setSource}
              options={[
                { value: "folder", label: "A folder", icon: "folder" },
                { value: "files", label: "Files", icon: "image" },
              ]}
            />
            {source === "folder" ? (
              <>
                <FolderField
                  value={folder}
                  onChange={setFolder}
                  pickTitle="Folder with the images"
                  placeholder="D:\Pictures\to-process"
                />
                <div className="flex items-center gap-2">
                  <Switch
                    size="sm"
                    checked={recursive}
                    onCheckedChange={setRecursive}
                    label="Include subfolders"
                  />
                  <span className="text-xs text-fg-2">Include subfolders</span>
                </div>
              </>
            ) : (
              <>
                <DropZone
                  compact
                  multiple
                  accept={ACCEPT}
                  busy={staging > 0}
                  onFiles={(list) => void addFiles(list)}
                  icon="image"
                  title={staging > 0 ? `Adding ${staging}…` : "Drop images here"}
                  hint="PNG, JPEG, WebP or BMP · or click to pick"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" icon="folder-open" onClick={() => void chooseFiles()}>
                    Choose files…
                  </Button>
                  <span className="text-xs text-fg-3 tabular">
                    {files.length} file{files.length === 1 ? "" : "s"}
                  </span>
                  {files.length ? (
                    <Button size="sm" variant="ghost" icon="x" onClick={() => setFiles([])}>
                      Clear
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </Field>

        <Field
          label="Output folder"
          layout="left"
          hint={
            textOnly
              ? "Captions are written as <image name>.txt; put them next to the images to train on them."
              : "Results are named after their image. Blombo never writes over an image you picked."
          }
        >
          <FolderField
            value={output}
            onChange={(v) => {
              setOutput(v);
              setOutputTouched(true);
            }}
            pickTitle="Where the results go"
            placeholder="D:\Pictures\processed"
          />
        </Field>

        <Field label="Options" layout="left">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <Switch
                size="sm"
                checked={skipExisting}
                onCheckedChange={setSkipExisting}
                label="Skip images that already have a result"
              />
              <span className="text-xs text-fg-2">
                Skip images that already have a result (so a stopped batch picks up where it was)
              </span>
            </div>
            {check.data?.makesText ? (
              <div className="flex items-center gap-2">
                <TextField
                  size="sm"
                  className="w-56"
                  value={prefix}
                  placeholder="my_trigger"
                  onChange={(e) => setPrefix(e.target.value)}
                  aria-label="Caption prefix"
                />
                <span className="text-xs text-fg-3">Put in front of every caption</span>
              </div>
            ) : null}
          </div>
        </Field>

        <div className="flex items-center gap-2">
          {running ? (
            <Button
              variant="danger"
              icon="stop"
              onClick={() => void api.cancelBatch().catch(() => undefined)}
            >
              Stop the batch
            </Button>
          ) : (
            <Button
              variant="primary"
              icon="play"
              loading={starting}
              disabled={!ready}
              onClick={() => void start()}
            >
              Run batch
            </Button>
          )}
          {comfy && comfy !== "running" && !running ? (
            <span className="text-xs text-fg-3">ComfyUI starts when the batch does.</span>
          ) : null}
          {running && run && run.workflowId !== manifest.id ? (
            <span className="text-xs text-fg-3">"{run.workflowName}" is running.</span>
          ) : null}
        </div>

        {mine ? <BatchRunView run={mine} /> : null}
      </div>
    </Panel>
  );
}

/** A batch run: progress, output folder and the files (also shown in the Design Lab). */
export function BatchRunView({ run }: { run: BatchRun }) {
  const counts = batchCounts(run);
  const total = run.items.length;
  const finished = total - counts.queued - counts.running;
  const progress = useLive((s) => s.progress);
  const current = run.items.find((i) => i.state === "running");
  const live = current && progress?.jobId === current.jobId ? progress.progress.overall : 0;
  const value = total ? (finished + live) / total : 1;
  const summary = [
    counts.done ? `${counts.done} done` : null,
    counts.skipped ? `${counts.skipped} already done` : null,
    counts.error ? `${counts.error} failed` : null,
    counts.cancelled ? `${counts.cancelled} stopped` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-h-0 flex-col gap-2.5 rounded-lg border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-fg">
          {run.state === "running"
            ? `Processing ${Math.min(finished + 1, total)} of ${total}`
            : run.state === "cancelled"
              ? "Stopped"
              : "Finished"}
        </span>
        <span className="truncate text-fg-3">{summary}</span>
        {run.state !== "running" ? (
          <Button
            size="sm"
            variant="ghost"
            icon="x"
            className="ml-auto"
            onClick={() => void api.clearBatch().catch(() => undefined)}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <ProgressBar
        value={value}
        label="Batch progress"
        tone={run.state === "done" && !counts.error ? "success" : "accent"}
        size="sm"
      />
      <span className="truncate font-mono text-2xs text-fg-3" title={run.output}>
        → {run.output}
      </span>
      {run.error ? <Notice tone="danger">{run.error}</Notice> : null}
      <ItemList items={run.items} />
    </div>
  );
}

const ROW = 30;

/** Every file of the batch (virtualized: a batch can hold thousands). */
function ItemList({ items }: { items: BatchItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({
    count: items.length,
    getScrollElement: () => ref.current,
    estimateSize: () => ROW,
    overscan: 8,
  });
  const runningIndex = useMemo(() => items.findIndex((i) => i.state === "running"), [items]);
  // Keep the running file in view.
  useEffect(() => {
    if (runningIndex >= 0) v.scrollToIndex(runningIndex, { align: "auto" });
  }, [runningIndex, v]);
  return (
    <div
      ref={ref}
      className="scroll-quiet max-h-[340px] min-h-[90px] overflow-auto rounded-md border border-line bg-sunken"
    >
      <div className="relative w-full" style={{ height: v.getTotalSize() }}>
        {v.getVirtualItems().map((row) => {
          const item = items[row.index] as BatchItem;
          const st = STATE[item.state];
          return (
            <div
              key={row.key}
              className="absolute inset-x-0 flex items-center gap-2 px-2.5 text-xs"
              style={{ top: row.start, height: ROW }}
            >
              <Icon name={st.icon} size={13} className={cn("shrink-0", st.ink)} />
              <span
                className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-2"
                title={item.name}
              >
                {item.name}
              </span>
              <span
                className={cn(
                  "max-w-[45%] shrink-0 truncate",
                  item.error ? "text-danger" : "text-fg-3",
                )}
                title={item.error ?? item.outputs.join(", ")}
              >
                {item.error ?? (item.outputs.length ? item.outputs.join(", ") : st.label)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
