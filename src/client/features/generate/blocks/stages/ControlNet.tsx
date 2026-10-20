/**
 * ControlNet: units that each guide the image with a control map. The map comes from an image
 * (uploaded, from the gallery, or the last output) through a comfyui_controlnet_aux
 * preprocessor, or is used as it is when it's already a map. Units chain before the base
 * sampler, so Hires fix follows them too (ADetailer redraws with the plain prompt).
 */
import { Icon } from "@client/icons/Icon";
import { api, stageImageUrl } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useLive } from "@client/lib/live";
import { useGalleryImages } from "@client/lib/queries";
import {
  Button,
  Collapsible,
  Dialog,
  DropZone,
  EmptyState,
  Field,
  NumberField,
  Select,
  type SelectOption,
  Slider,
  Spinner,
  TextField,
  toast,
} from "@client/ui";
import { comfyViewUrl } from "@shared/comfy";
import {
  ControlnetUnit,
  PREPROCESSOR_LABELS,
  preprocessorLabel,
  type StageImage,
} from "@shared/workflow/stages";
import { useState } from "react";
import { useStage, useValues } from "../../state";
import { modelOptions, problemSummary, StageNotices, useStageStatus } from "./common";
import { UnitBar, UnitHeader, useUnits } from "./units";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function preprocessorOptions(names: string[] | undefined, current: string): SelectOption<string>[] {
  // Without controlnet_aux only ready maps work; show the current choice so it isn't lost.
  const list = names?.length ? names : ["none"];
  const known = list.filter((n) => n === "none" || n in PREPROCESSOR_LABELS);
  const others = list.filter((n) => n !== "none" && !(n in PREPROCESSOR_LABELS));
  const out: SelectOption<string>[] = [
    ...known.map((n) => ({
      value: n,
      label: preprocessorLabel(n),
      group: n === "none" ? undefined : "Common",
    })),
    ...others.map((n) => ({ value: n, label: preprocessorLabel(n), group: "More" })),
  ];
  if (!list.includes(current))
    out.push({
      value: current,
      label: `${preprocessorLabel(current)} (missing)`,
      group: "Not found",
    });
  return out;
}

/** Pick an image from the gallery: the newest first, with a search. */
function GalleryPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (id: number) => void;
}) {
  const [q, setQ] = useState("");
  // One page is plenty for picking; search narrows it.
  const images = useGalleryImages({ q, limit: 120 });
  const items = images.data?.pages[0]?.items ?? [];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Use an image from the gallery"
      description="It's copied into the profile, so the unit keeps it even if the file moves."
      width={760}
    >
      <div className="flex flex-col gap-3">
        <TextField
          icon="search"
          size="sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onClear={() => setQ("")}
          placeholder="Search prompts and names"
          aria-label="Search the gallery"
        />
        <div className="scroll-quiet grid max-h-[460px] grid-cols-5 gap-1.5 overflow-y-auto">
          {images.isLoading ? (
            <div className="col-span-5 grid h-40 place-items-center">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              className="col-span-5"
              icon="gallery"
              title="No images"
              text={
                q
                  ? "Nothing matches that search."
                  : "Generated images and gallery folders show up here."
              }
            />
          ) : (
            items.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => onPick(img.id)}
                title={img.name}
                className="group relative aspect-square overflow-hidden rounded-md border border-line bg-sunken focus-ring hover:border-accent-ink/60"
              >
                <img
                  src={img.thumb}
                  alt={img.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                />
              </button>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}

function ImageTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-md border border-line bg-sunken">
      {children}
      <span className="absolute bottom-1.5 left-1.5 rounded-xs bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
        {label}
      </span>
    </div>
  );
}

/** The unit's image: add it three ways, see it next to the map the preprocessor makes. */
function ControlImage({
  image,
  preprocessor,
  resolution,
  onImage,
}: {
  image: StageImage | null;
  preprocessor: string;
  resolution: number;
  onImage: (image: StageImage | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [map, setMap] = useState<{ key: string; url: string } | null>(null);
  const [mapping, setMapping] = useState(false);
  const last = useLive((s) => {
    for (const j of s.queue.jobs)
      if (j.state === "done") {
        const img = j.images.find((i) => i.type === "output") ?? j.images[0];
        if (img) return img;
      }
    return null;
  });
  const mapKey = image ? `${image.file}:${preprocessor}:${resolution}` : "";
  const add = async (work: () => Promise<StageImage>) => {
    setBusy(true);
    try {
      onImage(await work());
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const showMap = async () => {
    if (!image) return;
    setMapping(true);
    try {
      const ref = await api.previewMap(image.file, preprocessor, resolution);
      setMap({ key: mapKey, url: comfyViewUrl(ref) });
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setMapping(false);
    }
  };
  const preprocess = preprocessor !== "none" && preprocessor !== "";
  const sources = (
    <div className="flex gap-1.5">
      <Button
        size="sm"
        icon="gallery"
        className="flex-1"
        onClick={() => setPicking(true)}
        disabled={busy}
      >
        From gallery
      </Button>
      <Button
        size="sm"
        icon="image"
        className="flex-1"
        disabled={busy || !last}
        title={last ? undefined : "Generate something first"}
        onClick={() => last && void add(() => api.stageImageFromOutput(last))}
      >
        Last output
      </Button>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {image ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <ImageTile label="Image">
              <img
                src={stageImageUrl(image.file)}
                alt={image.label}
                className="absolute inset-0 h-full w-full object-contain"
              />
            </ImageTile>
            <ImageTile label={preprocess ? "Map" : "Used as the map"}>
              {!preprocess ? (
                <img
                  src={stageImageUrl(image.file)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain opacity-70"
                />
              ) : map?.key === mapKey ? (
                <img
                  src={map.url}
                  alt={`${preprocessorLabel(preprocessor)} map`}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="eye"
                  loading={mapping}
                  onClick={() => void showMap()}
                >
                  Show map
                </Button>
              )}
            </ImageTile>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="min-w-0 flex-1 truncate font-mono text-2xs text-fg-3"
              title={image.label}
            >
              {image.label} · {image.width}×{image.height}
            </span>
            <label
              className={cn(
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm px-2 text-xs text-fg-2 hover:bg-field hover:text-fg focus-within:ring-2 focus-within:ring-accent/40",
                busy && "pointer-events-none opacity-50",
              )}
            >
              <Icon name="upload" size={13} />
              Replace
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void add(() => api.uploadStageImage(f, f.name));
                }}
              />
            </label>
            <Button size="sm" variant="ghost" icon="x" onClick={() => onImage(null)}>
              Remove
            </Button>
          </div>
          {sources}
        </>
      ) : (
        <>
          <DropZone
            compact
            busy={busy}
            accept="image/png,image/jpeg,image/webp"
            title="Drop an image or click to pick one"
            hint="A photo or render to take the pose, edges or depth from, or a ready map"
            onFile={(f) => void add(() => api.uploadStageImage(f, f.name))}
          />
          {sources}
        </>
      )}
      <GalleryPicker
        open={picking}
        onOpenChange={setPicking}
        onPick={(id) => {
          setPicking(false);
          void add(() => api.stageImageFromGallery(id));
        }}
      />
    </div>
  );
}

export function ControlNetStage() {
  const [cn_, set] = useStage("controlnet");
  const status = useStageStatus("controlnet");
  const units = useUnits(
    cn_.units,
    (next) => set({ units: next }),
    (id, name, from) =>
      ControlnetUnit.parse({ ...(from ?? {}), id, name, enabled: true, image: null }),
  );
  const unit = units.active;
  if (!unit) return null;
  const on = cn_.units.filter((u) => u.enabled);
  const issue = problemSummary(status);
  return (
    <Collapsible
      title="ControlNet"
      icon="pose"
      subtitle={
        issue ??
        (on.length
          ? on
              .map((u) => `${u.name} · ${preprocessorLabel(u.preprocessor)} · ${u.strength}`)
              .join(", ")
          : "No units on")
      }
      enabled={cn_.enabled}
      onEnabledChange={(enabled) => set({ enabled })}
    >
      <div className="flex flex-col gap-3.5">
        <UnitBar
          units={cn_.units}
          active={unit}
          onActive={units.setActive}
          onAdd={units.add}
          status={status}
          group="controlnet"
        />
        <UnitHeader
          unit={unit}
          count={cn_.units.length}
          onChange={units.update}
          onRemove={units.remove}
        />
        <StageNotices status={status} unit={unit.id} />
        <ControlImage
          image={unit.image}
          preprocessor={unit.preprocessor}
          resolution={unit.resolution}
          onImage={(image) => units.update({ image })}
        />
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Preprocessor">
            <Select
              value={unit.preprocessor}
              onChange={(preprocessor) => units.update({ preprocessor })}
              options={preprocessorOptions(status?.choices.preprocessor, unit.preprocessor)}
              className="w-full"
              label="Preprocessor"
            />
          </Field>
          {unit.preprocessor !== "none" ? (
            <Field label="Detail">
              <NumberField
                value={unit.resolution}
                onChange={(resolution) => units.update({ resolution })}
                min={256}
                max={2048}
                step={64}
                unit="px"
                label="Map resolution"
                className="w-[110px]"
              />
            </Field>
          ) : null}
        </div>
        <Field label="Model">
          <Select
            value={unit.model}
            onChange={(model) => units.update({ model })}
            options={modelOptions(status?.choices.model, unit.model)}
            placeholder="Pick a ControlNet model"
            className="w-full"
            label="ControlNet model"
          />
        </Field>
        <Slider
          label="Strength"
          value={unit.strength}
          onChange={(strength) => units.update({ strength })}
          min={0}
          max={2}
          step={0.05}
          defaultValue={1}
        />
        <div className="grid grid-cols-2 gap-4">
          <Slider
            label="Start"
            value={unit.start}
            onChange={(start) => units.update({ start: Math.min(start, unit.end) })}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="End"
            value={unit.end}
            onChange={(end) => units.update({ end: Math.max(end, unit.start) })}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      </div>
    </Collapsible>
  );
}

/** "Use as ControlNet image" from the gallery: into the first unit, and turn ControlNet on. */
export async function controlImageFromGallery(galleryId: number): Promise<boolean> {
  if (!useValues.getState().workflowId) {
    toast("Open Generate with a workflow first.", "warning");
    return false;
  }
  try {
    const image = await api.stageImageFromGallery(galleryId);
    const s = useValues.getState();
    const cn_ = s.stages.controlnet;
    const target = cn_.units.find((u) => !u.image) ?? cn_.units[0];
    if (!target) return false;
    s.setStage("controlnet", {
      ...cn_,
      enabled: true,
      units: cn_.units.map((u) => (u.id === target.id ? { ...u, image, enabled: true } : u)),
    });
    toast(`Set as the image of ControlNet ${target.name}`, "success");
    return true;
  } catch (e) {
    toast(message(e), "error");
    return false;
  }
}
