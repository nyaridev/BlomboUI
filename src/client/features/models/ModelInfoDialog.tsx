/**
 * The model info dialog (the old app's "model settings", rebuilt): the picture big on the left,
 * the file and its hashes in the middle, and what you can change on the right: trigger words,
 * a LoRA's strength and its slider's range, whether it's instant and where its trigger words go, and your notes, saved
 * into the model's A1111 .json, plus a new picture
 * (from a file or the latest Generate result) or none. Opened from any model's right-click menu
 * (`openModelInfo`); mounted once in Shell.
 */

import { Icon } from "@client/icons/Icon";
import { useClock } from "@client/lib/clock";
import { useLive } from "@client/lib/live";
import { formatBytes } from "@client/lib/number";
import {
  useLocalModels,
  useModelDetails,
  useModelHashes,
  useSaveModelInfo,
  useSettings,
} from "@client/lib/queries";
import {
  Button,
  Dialog,
  FallbackFace,
  Field,
  IconButton,
  KIND_STYLE,
  Menu,
  NumberField,
  PropertyList,
  ScrubField,
  Segmented,
  Skeleton,
  Spinner,
  Switch,
  TextArea,
  toast,
  Veil,
} from "@client/ui";
import { comfyViewUrl } from "@shared/comfy";
import type { Job } from "@shared/jobs";
import { DEFAULT_STRENGTH_RANGE, type LocalModel, type ModelDetails } from "@shared/models";
import { useEffect, useMemo, useRef, useState } from "react";
import { PromptEditor } from "../generate/PromptEditor";
import { useModelActions, useModelInfo } from "./actions";

export function ModelInfoDialog() {
  const id = useModelInfo((s) => s.id);
  const model = useLocalModels(id !== null).data?.models.find((m) => m.id === id) ?? null;
  const close = () => useModelInfo.setState({ id: null });
  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && close()} bare width={1040}>
      {model ? (
        // Keyed by file: another model starts from its own values.
        <InfoBody key={`${model.id}:${model.mtime}`} model={model} onClose={close} />
      ) : (
        <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-fg-3">
          <Icon name="models" size={22} />
          That model isn't in the models folder anymore.
          <Button onClick={close}>Close</Button>
        </div>
      )}
    </Dialog>
  );
}

/** The newest picture Generate made (what its image stage shows first), if any. */
function latestResult(jobs: Job[]): string | null {
  for (const job of jobs) {
    if (job.state !== "done" || job.group?.kind === "batch") continue;
    if (job.file) return job.file.url;
    const image =
      job.images.find((i) => i.type === "output") ?? job.images.find((i) => i.type !== "output");
    if (image) return comfyViewUrl(image);
  }
  return null;
}

const splitWords = (text: string) =>
  text
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);

function InfoBody({ model, onClose }: { model: LocalModel; onClose: () => void }) {
  const details = useModelDetails(model.id);
  const d = details.data;
  const style = KIND_STYLE[model.kind];
  const lora = model.kind === "loras";
  const showWords = lora || model.kind === "embeddings" || model.triggerWords.length > 0;
  const actions = useModelActions();
  const save = useSaveModelInfo();

  const startWords = model.triggerWords.join(", ");
  const [words, setWords] = useState(startWords);
  const [weight, setWeight] = useState<number | null>(model.weight);
  const [range, setRange] = useState<[number, number]>(model.strengthRange);
  const [instant, setInstant] = useState(model.instant);
  const [triggerAt, setTriggerAt] = useState(model.triggerAt);
  const [notes, setNotes] = useState<string | null>(null);
  const startNotes = d?.notes ?? "";
  const notesValue = notes ?? startNotes;

  // A new picture waits for Save, like the other fields: a Blob, or "remove".
  const [picture, setPicture] = useState<Blob | "remove" | null>(null);
  const preview = useMemo(
    () => (picture && picture !== "remove" ? URL.createObjectURL(picture) : null),
    [picture],
  );
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useLive((s) => latestResult(s.queue.jobs));

  const wordsChanged = splitWords(words).join(", ") !== splitWords(startWords).join(", ");
  const weightChanged = weight !== model.weight;
  const sameRange = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];
  const rangeChanged = !sameRange(range, model.strengthRange);
  const rangeOk = range[0] < range[1];
  const instantChanged = instant !== model.instant;
  const triggerAtChanged = triggerAt !== model.triggerAt;
  const notesChanged = notes !== null && notes.trim() !== startNotes.trim();
  const infoChanged =
    wordsChanged ||
    weightChanged ||
    rangeChanged ||
    instantChanged ||
    triggerAtChanged ||
    notesChanged;
  const dirty = infoChanged || picture !== null;

  const fromLatest = async () => {
    if (!latest) return;
    try {
      const res = await fetch(latest);
      if (!res.ok) throw new Error();
      setPicture(await res.blob());
    } catch {
      toast("Couldn't load the latest result. Is ComfyUI still running?", "error");
    }
  };

  const submit = () => {
    const info = infoChanged
      ? {
          id: model.id,
          ...(wordsChanged ? { triggerWords: splitWords(words) } : {}),
          ...(weightChanged ? { weight } : {}),
          ...(instantChanged ? { instant } : {}),
          // The default range is saved as no range, so a later default change reaches it.
          ...(rangeChanged
            ? { strengthRange: sameRange(range, DEFAULT_STRENGTH_RANGE) ? null : range }
            : {}),
          ...(triggerAtChanged ? { triggerAt } : {}),
          ...(notesChanged ? { notes: notesValue } : {}),
        }
      : null;
    save.mutate(
      { info, picture: picture ? { id: model.id, image: picture } : null },
      {
        onSuccess: () => {
          toast(`Saved ${model.name}`, "success");
          onClose();
        },
        onError: (e) => toast(e.message, "error"),
      },
    );
  };

  const shownThumb = picture === "remove" ? null : (preview ?? model.thumb);
  const hasPicture = picture === "remove" ? false : picture !== null || Boolean(d?.picture);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line py-2.5 pr-2.5 pl-4">
        <Icon name={style.icon} size={16} className="shrink-0 text-fg-3" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{model.name}</h2>
        <IconButton
          icon="file-info"
          label="File info"
          size="sm"
          onClick={() => {
            onClose();
            actions.fileInfo(model);
          }}
        />
        <IconButton
          icon="folder-open"
          label="Show in Explorer"
          size="sm"
          onClick={() => actions.reveal(model)}
        />
        {model.civitai ? (
          <IconButton
            icon="globe"
            label="Open on Civitai"
            size="sm"
            onClick={() => {
              onClose();
              actions.civitai(model);
            }}
          />
        ) : null}
        <IconButton icon="x" label="Close" size="sm" onClick={onClose} />
      </header>

      <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)] gap-5 overflow-y-auto p-5 max-lg:grid-cols-1 max-lg:p-4">
        <div className="flex flex-col gap-2 max-lg:mx-auto max-lg:w-56">
          <Picture model={model} thumb={shownThumb} pending={picture !== null} />
          <Menu
            placement="bottom-start"
            width={240}
            trigger={
              <Button icon="image" iconRight="chevron-down" className="w-full">
                Replace picture
              </Button>
            }
            items={[
              {
                id: "file",
                label: "From a file…",
                icon: "upload",
                onSelect: () => fileInput.current?.click(),
              },
              {
                id: "latest",
                label: "From the latest result",
                icon: "generate",
                disabled: !latest,
                hint: latest ? undefined : <span className="text-xs text-fg-4">none yet</span>,
                onSelect: () => void fromLatest(),
              },
              { type: "separator", id: "s" },
              {
                id: "remove",
                label: "Remove picture",
                icon: "trash",
                tone: "danger",
                disabled: !hasPicture,
                onSelect: () => setPicture("remove"),
              },
            ]}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPicture(file);
              e.target.value = "";
            }}
          />
          {picture !== null ? (
            <p className="text-xs text-fg-3">
              {picture === "remove"
                ? "The picture moves to the profile's trash when you save."
                : "The new picture is used when you save. The old one goes to the profile's trash."}
            </p>
          ) : null}
        </div>

        <section className="flex min-w-0 flex-col gap-4">
          <h3 className="label-caps">File</h3>
          <FileFacts model={model} details={d} loading={details.isLoading} />
          {details.error ? <p className="text-sm text-danger">{details.error.message}</p> : null}
          <h3 className="label-caps">Hashes</h3>
          <Hashes model={model} />
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <h3 className="label-caps">{style.label}</h3>
          {showWords ? (
            <Field
              label="Trigger words"
              hint={
                lora
                  ? instant
                    ? "Added to the prompt when generating. Separate with commas."
                    : "Added after the LoRA tag when you pick it. Separate with commas."
                  : "Separate with commas."
              }
            >
              <PromptEditor
                label="Trigger words"
                value={words}
                onChange={setWords}
                minRows={2}
                placeholder="blue hair, glowing eyes"
              />
            </Field>
          ) : null}
          {lora ? (
            <Field
              label="Strength"
              hint="What it gets when you add it from the picker or autocomplete."
              action={
                weight !== null ? (
                  <Button variant="ghost" size="sm" onClick={() => setWeight(null)}>
                    Use 1
                  </Button>
                ) : null
              }
            >
              <ScrubField
                ariaLabel="Strength"
                value={weight ?? 1}
                onChange={setWeight}
                min={-5}
                max={5}
                step={0.05}
                defaultValue={1}
                format={(v) => String(Number(v.toFixed(2)))}
              />
            </Field>
          ) : null}
          {lora ? (
            <Field
              label="Slider range"
              hint="Lowest and highest strength on its slider above the prompt."
              error={rangeOk ? undefined : "Make the lowest strength smaller than the highest."}
              action={
                sameRange(range, DEFAULT_STRENGTH_RANGE) ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRange(DEFAULT_STRENGTH_RANGE)}
                  >
                    Use 0–2
                  </Button>
                )
              }
            >
              <div className="flex items-center gap-2">
                <NumberField
                  label="Lowest strength"
                  value={range[0]}
                  onChange={(v) => setRange([v, range[1]])}
                  min={-10}
                  max={10}
                  step={0.05}
                  className="w-24"
                />
                <span className="text-fg-3">to</span>
                <NumberField
                  label="Highest strength"
                  value={range[1]}
                  onChange={(v) => setRange([range[0], v])}
                  min={-10}
                  max={10}
                  step={0.05}
                  className="w-24"
                />
              </div>
            </Field>
          ) : null}
          {lora ? (
            <Field
              label="Instant LoRA"
              layout="left"
              labelWidth={120}
              hint={
                instant
                  ? "Picking it adds it beside the prompt, not into the text."
                  : "Picking it puts a <lora:…> tag and its trigger words into the prompt."
              }
            >
              <Switch checked={instant} onCheckedChange={setInstant} label="Instant LoRA" />
            </Field>
          ) : null}
          {lora && instant ? (
            <Field
              label="Trigger words go"
              layout="left"
              labelWidth={120}
              hint="Where they're added in the prompt when generating."
            >
              <Segmented
                label="Trigger words go"
                size="sm"
                value={triggerAt}
                onChange={setTriggerAt}
                options={[
                  { value: "start", label: "At the start" },
                  { value: "end", label: "At the end" },
                ]}
              />
            </Field>
          ) : null}
          <Field label="Notes" hint="Only for you: what it's good at, settings that work.">
            {(fieldId) => (
              <TextArea
                id={fieldId}
                value={notesValue}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                maxRows={14}
                placeholder="Works best at 0.7 with DPM++ 2M"
              />
            )}
          </Field>
          {d?.description ? <Description html={d.description} /> : null}
        </section>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
        <span className="mr-auto truncate text-xs text-fg-3 max-lg:hidden">
          Saved next to the model, in {model.file.replace(/\.[^.]+$/, "")}.json
        </span>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!dirty || !rangeOk}
          loading={save.isPending}
          onClick={submit}
        >
          Save
        </Button>
      </footer>
    </div>
  );
}

function Picture({
  model,
  thumb,
  pending,
}: {
  model: LocalModel;
  thumb: string | null;
  pending: boolean;
}) {
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  return (
    <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-line bg-sunken">
      {thumb ? (
        <Veil active={model.nsfw && blurNsfw && !pending} className="h-full w-full">
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        </Veil>
      ) : (
        <FallbackFace name={model.name} kind={model.kind} className="absolute inset-0" />
      )}
      {pending ? (
        <span className="absolute top-2 left-2 rounded-xs bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-white">
          Not saved yet
        </span>
      ) : null}
    </div>
  );
}

function FileFacts({
  model,
  details,
  loading,
}: {
  model: LocalModel;
  details: ModelDetails | undefined;
  loading: boolean;
}) {
  const actions = useModelActions();
  const clock = useClock();
  if (loading)
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  const d = details;
  return (
    <PropertyList
      labelWidth={88}
      items={[
        { label: "Path", value: d?.path, copy: d?.path, mono: true },
        { label: "File", value: model.file, copy: model.file },
        { label: "Folder", value: model.folder || "(top level)" },
        { label: "Size", value: formatBytes(model.size) },
        { label: "Modified", value: clock.dateTime(model.mtime) },
        { label: "Base model", value: d?.header?.training.baseModel ?? model.baseModel },
        {
          label: "Network",
          value: d?.header?.training.network
            ? `${d.header.training.network}${d.header.training.dim ? ` · rank ${d.header.training.dim}` : ""}`
            : null,
        },
        {
          label: "Civitai",
          value: d?.civitai?.modelId ? (
            <button
              type="button"
              className="text-left text-accent-ink hover:underline focus-ring"
              onClick={() => actions.civitai(model)}
            >
              {[d.civitai.name, d.civitai.version].filter(Boolean).join(" · ") || "Open its page"}
            </button>
          ) : null,
        },
        { label: "Creator", value: d?.civitai?.creator },
      ]}
    />
  );
}

function Hashes({ model }: { model: LocalModel }) {
  const hashes = useModelHashes(model);
  if (hashes.isLoading)
    return (
      <span className="flex items-center gap-2 text-sm text-fg-3">
        <Spinner size={13} />
        Hashing the file ({formatBytes(model.size)})…
      </span>
    );
  if (hashes.error) return <p className="text-sm text-danger">{hashes.error.message}</p>;
  if (!hashes.data) return null;
  return (
    <PropertyList
      labelWidth={88}
      items={[
        { label: "SHA256", value: hashes.data.sha256, copy: hashes.data.sha256, mono: true },
        { label: "AutoV2", value: hashes.data.autov2, copy: hashes.data.autov2, mono: true },
      ]}
    />
  );
}

function Description({ html }: { html: string }) {
  const text = useMemo(() => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
  }, [html]);
  if (!text) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label-caps">From Civitai</span>
      <p className="max-h-40 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-fg-3">
        {text}
      </p>
    </div>
  );
}
