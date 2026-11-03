/**
 * The model info dialog (the old app's "model settings", rebuilt in its layout): the picture as
 * tall as the dialog on the left, the file (fields to read and copy) and its hashes in the
 * middle, and what you can change on the right: trigger words, a Strength box (strength, slider
 * range), an Automatic LoRA box (instant, where its trigger words go) and your notes, saved into
 * the model's A1111 .json. Under the columns, one wide button each: Cancel, Replace picture (from
 * a file, the latest Generate result, or none) and Save. The dialog is one size for every model
 * (each column scrolls on its own) and the picture is always 2:3, sized from its height. Below
 * 1024 px the settings and the file share one column beside the picture (settings first);
 * below 640 px the picture goes. Opened from any model's right-click menu (`openModelInfo`);
 * mounted once in Shell.
 */

import { Icon } from "@client/icons/Icon";
import { useClock } from "@client/lib/clock";
import { cn } from "@client/lib/cn";
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
  CopyButton,
  Dialog,
  FallbackFace,
  Field,
  IconButton,
  KIND_STYLE,
  Menu,
  NumberField,
  ScrubField,
  Segmented,
  Skeleton,
  Spinner,
  Switch,
  TextArea,
  TextField,
  toast,
  Veil,
} from "@client/ui";
import { comfyViewUrl } from "@shared/comfy";
import type { Job } from "@shared/jobs";
import { DEFAULT_STRENGTH_RANGE, type LocalModel, type ModelDetails } from "@shared/models";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PromptEditor } from "../generate/PromptEditor";
import { useModelActions, useModelInfo } from "./actions";

export function ModelInfoDialog() {
  const id = useModelInfo((s) => s.id);
  const model = useLocalModels(id !== null).data?.models.find((m) => m.id === id) ?? null;
  const close = () => useModelInfo.setState({ id: null });
  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && close()} bare width={1240}>
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

  // The full-size picture when there is one: it's shown big here.
  const shownThumb = picture === "remove" ? null : (preview ?? model.rawThumb ?? model.thumb);
  const hasPicture = picture === "remove" ? false : picture !== null || Boolean(d?.picture);

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={SIZES}>
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

      {/* The picture, the file and what you can change (see the module comment for narrow screens). */}
      <div
        className={cn(
          COLUMNS,
          "scroll-quiet h-(--body-h) overflow-y-auto p-5 max-sm:grid-cols-1 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden",
        )}
      >
        <div className="h-(--pic-h) w-(--pic-w) max-lg:sticky max-lg:top-0 max-lg:row-span-2 max-lg:row-start-1 max-sm:hidden">
          <Picture
            model={model}
            thumb={shownThumb}
            pending={
              picture === null
                ? null
                : picture === "remove"
                  ? "The picture moves to the profile's trash when you save."
                  : "The new picture is used when you save. The old one goes to the profile's trash."
            }
          />
        </div>

        <section className={cn(COLUMN, "max-lg:row-start-2")}>
          <Heading>File</Heading>
          <FileFacts model={model} details={d} loading={details.isLoading} />
          {details.error ? <p className="text-sm text-danger">{details.error.message}</p> : null}
          <Group title="Hashes">
            <Hashes model={model} />
          </Group>
        </section>

        <section className={cn(COLUMN, "max-lg:row-start-1")}>
          <Heading>{style.label}</Heading>
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
            <Group title="Strength">
              <Field
                label="Strength"
                layout="left"
                labelWidth={96}
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
              <Field
                label="Slider range"
                layout="left"
                labelWidth={96}
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
            </Group>
          ) : null}
          {lora ? (
            <Group title="Automatic LoRA">
              <Field
                label="Instant LoRA"
                layout="left"
                labelWidth={96}
                hint={
                  instant
                    ? "Picking it adds it beside the prompt, not into the text."
                    : "Picking it puts a <lora:…> tag and its trigger words into the prompt."
                }
              >
                <Switch checked={instant} onCheckedChange={setInstant} label="Instant LoRA" />
              </Field>
              {instant ? (
                <Field
                  label="Trigger words"
                  layout="left"
                  labelWidth={96}
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
            </Group>
          ) : null}
          <Field label="Notes" hint="Only for you: what it's good at, settings that work.">
            {(fieldId) => (
              <TextArea
                id={fieldId}
                value={notesValue}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxRows={12}
                placeholder="Works best at 0.7 with DPM++ 2M"
              />
            )}
          </Field>
          {d?.description ? <Description html={d.description} /> : null}
        </section>
      </div>

      {/* The old app's footer: one wide button under each column. */}
      <footer className="grid grid-cols-[var(--pic-w)_minmax(0,1fr)_minmax(0,1fr)] gap-5 border-t border-line bg-surface px-5 py-3 max-sm:grid-cols-2">
        <Button variant="ghost" onClick={onClose} className="w-full">
          Cancel
        </Button>
        <Menu
          placement="top"
          width={240}
          trigger={
            <Button icon="image" iconRight="chevron-down" className="w-full max-sm:hidden">
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
        <Button
          variant="primary"
          disabled={!dirty || !rangeOk}
          loading={save.isPending}
          onClick={submit}
          title={`Saved next to the model, in ${model.file.replace(/\.[^.]+$/, "")}.json`}
          className="w-full"
        >
          Save
        </Button>
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
      </footer>
    </div>
  );
}

/**
 * One size for every model: the body is as tall as fits (620 px at most), and the picture column
 * is 2:3 of the body's inner height, so the footer's buttons line up under the columns.
 */
const SIZES = {
  "--body-h": "min(620px, calc(min(88vh, 900px) - 6.5rem))",
  "--pic-h": "calc(var(--body-h) - 2.5rem)",
  "--pic-w": "calc(var(--pic-h) * 2 / 3)",
} as CSSProperties;

const COLUMNS =
  "grid grid-cols-[var(--pic-w)_minmax(0,1fr)_minmax(0,1fr)] gap-5 max-lg:grid-cols-[var(--pic-w)_minmax(0,1fr)]";

/** File and settings: their own scroll on wide screens, one shared column beside the picture below. */
const COLUMN =
  "flex min-w-0 flex-col gap-3 sm:max-lg:col-start-2 lg:scroll-quiet lg:min-h-0 lg:overflow-y-auto lg:pr-1";

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="border-b border-line pb-1.5 text-sm font-semibold text-balance text-fg">
      {children}
    </h3>
  );
}

/** A titled box inside a column (Hashes, Strength, Automatic LoRA). */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
      <h4 className="border-b border-line pb-1.5 text-xs font-semibold text-fg">{title}</h4>
      {children}
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
  /** A picture change waiting for Save: what will happen, shown over the bottom. */
  pending: string | null;
}) {
  const blurNsfw = useSettings().data?.models.blurNsfw ?? true;
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-line bg-sunken">
      {thumb ? (
        <Veil active={model.nsfw && blurNsfw && pending === null} className="absolute inset-0">
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        </Veil>
      ) : (
        <FallbackFace name={model.name} kind={model.kind} className="absolute inset-0" />
      )}
      {pending !== null ? (
        <>
          <span className="absolute top-2 left-2 rounded-xs bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-white">
            Not saved yet
          </span>
          <p className="absolute inset-x-0 bottom-0 bg-black/65 px-3 py-2 text-xs text-white/85">
            {pending}
          </p>
        </>
      ) : null}
    </div>
  );
}

/** A read-only value in a field box, with a copy button when it's worth copying. */
function Value({
  label,
  value,
  mono,
  copy,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  copy?: boolean;
}) {
  if (!value) return null;
  return (
    <Field label={label}>
      {(id) => (
        <TextField
          id={id}
          value={value}
          readOnly
          mono={mono}
          title={value}
          trailing={
            copy ? <CopyButton text={value} label={`Copy ${label.toLowerCase()}`} /> : undefined
          }
        />
      )}
    </Field>
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
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/5" />
      </div>
    );
  const d = details;
  const network = d?.header?.training.network
    ? `${d.header.training.network}${d.header.training.dim ? ` · rank ${d.header.training.dim}` : ""}`
    : null;
  return (
    <>
      <Value label="Path" value={d?.path} mono copy />
      <Value label="File name" value={model.file} mono copy />
      <div className="grid grid-cols-2 gap-3">
        <Value label="Size" value={formatBytes(model.size)} mono />
        <Value label="Modified" value={clock.dateTime(model.mtime)} mono />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Value label="Folder" value={model.folder || "(top level)"} />
        <Value label="Base model" value={d?.header?.training.baseModel ?? model.baseModel} />
      </div>
      <Value label="Network" value={network} />
      {d?.civitai?.modelId ? (
        <Field label="Civitai">
          <button
            type="button"
            className="w-fit text-left text-sm text-accent-ink hover:underline focus-ring"
            onClick={() => actions.civitai(model)}
          >
            {[d.civitai.name, d.civitai.version].filter(Boolean).join(" · ") || "Open its page"}
            {d.civitai.creator ? <span className="text-fg-3"> by {d.civitai.creator}</span> : null}
          </button>
        </Field>
      ) : null}
    </>
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
    <>
      <Value label="SHA256" value={hashes.data.sha256} mono copy />
      <Value label="AutoV2" value={hashes.data.autov2} mono copy />
    </>
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
