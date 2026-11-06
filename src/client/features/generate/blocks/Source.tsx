/**
 * The first pass's mode (the `source` stage): Text to image starts from an empty latent; Image to
 * image from a picture, fitted to the workflow's size (cropped) at a denoise; Inpaint also takes a
 * painted mask, so only that part is redrawn. The image comes from a file, the gallery or the
 * last output, and is kept in the profile like a ControlNet image. Sits at the top of the First
 * pass card (a layout feature, `source`).
 */
import { pauseShortcuts } from "@client/app/useShortcuts";
import { api, stageImageUrl } from "@client/lib/api";
import {
  Button,
  Dialog,
  DropZone,
  Field,
  MaskPainter,
  type MaskPainterHandle,
  Select,
  Slider,
  toast,
} from "@client/ui";
import {
  SOURCE_MODE_LABELS,
  SOURCE_MODES,
  type SourceMode,
  type StageImage,
} from "@shared/workflow/stages";
import { useEffect, useRef, useState } from "react";
import { useStage, useValues } from "../state";
import { useRoleBinding } from "../workflow";
import { StageNotices, useStageStatus } from "./stages/common";
import { GalleryPicker, useLastOutput } from "./stages/images";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const HINTS: Record<SourceMode, string> = {
  txt2img: "Starts from noise: the prompt makes the whole image.",
  img2img: "Starts from your image: low denoise keeps it, high denoise changes more.",
  inpaint: "Redraws only the part you paint; the rest stays as it is.",
};

export function SourceBlock() {
  const [s, set] = useStage("source");
  const status = useStageStatus("source");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [painting, setPainting] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);
  const last = useLastOutput();
  const width = useRoleBinding("latent.width");
  const height = useRoleBinding("latent.height");
  const w = useValues((st) => (width ? Number(st.values[width.id]) : Number.NaN));
  const h = useValues((st) => (height ? Number(st.values[height.id]) : Number.NaN));
  const setValue = useValues((st) => st.setValue);
  const on = s.mode !== "txt2img";
  const inpaint = s.mode === "inpaint";

  const add = async (work: () => Promise<StageImage>) => {
    setBusy(true);
    try {
      const image = await work();
      // A new picture needs a new mask.
      set({ image, mask: image.file === s.image?.file ? s.mask : null });
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const matchImageSize = () => {
    if (!s.image || !width || !height) return;
    const step = width.step ?? 8;
    const snap = (n: number, min = 64, max = 8192) =>
      Math.min(max, Math.max(min, Math.round(n / step) * step));
    setValue(width.id, snap(s.image.width, width.min, width.max));
    setValue(height.id, snap(s.image.height, height.min, height.max));
  };

  const sized = Number.isFinite(w) && Number.isFinite(h);
  const sameSize =
    s.image && sized && Math.abs(s.image.width - w) < 8 && Math.abs(s.image.height - h) < 8;

  return (
    <div className="flex flex-col gap-3">
      <Field label="Start from" hint={HINTS[s.mode]}>
        <Select
          value={s.mode}
          onChange={(mode) => set({ mode })}
          options={SOURCE_MODES.map((m) => ({ value: m, label: SOURCE_MODE_LABELS[m] }))}
          aria-label="What the first pass starts from"
        />
      </Field>
      {on ? (
        <>
          <StageNotices status={status} />
          {s.image ? (
            <div className="flex gap-3 max-sm:flex-col">
              <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-md border border-line bg-sunken max-sm:w-full">
                <img
                  src={stageImageUrl(s.image.file)}
                  alt={s.image.label}
                  className="absolute inset-0 h-full w-full object-contain"
                />
                {inpaint && s.mask ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-accent opacity-55"
                    style={{
                      maskImage: `url(${stageImageUrl(s.mask.file)})`,
                      maskMode: "luminance",
                      maskSize: "contain",
                      maskPosition: "center",
                      maskRepeat: "no-repeat",
                    }}
                  />
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="truncate font-mono text-2xs text-fg-3" title={s.image.label}>
                  {s.image.label} · {s.image.width}×{s.image.height}
                </span>
                {sized ? (
                  <span className="text-xs text-fg-3">
                    {sameSize ? "Used at its own size." : `Fitted to ${w}×${h} (cropped to fill).`}
                  </span>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {inpaint ? (
                    <Button
                      size="sm"
                      variant={s.mask ? "secondary" : "primary"}
                      icon="edit"
                      onClick={() => setPainting(true)}
                    >
                      {s.mask ? "Edit mask" : "Paint mask"}
                    </Button>
                  ) : null}
                  {sized && !sameSize && width && height ? (
                    <Button size="sm" variant="ghost" icon="aspect-ratio" onClick={matchImageSize}>
                      Use its size
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="upload"
                    disabled={busy}
                    onClick={() => replaceInput.current?.click()}
                  >
                    Replace
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="x"
                    onClick={() => set({ image: null, mask: null })}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <DropZone
              compact
              busy={busy}
              accept="image/png,image/jpeg,image/webp"
              title="Drop an image or click to pick one"
              hint={
                inpaint
                  ? "The picture to fix; you paint over what should change next"
                  : "The picture to start from"
              }
              onFile={(f) => void add(() => api.uploadStageImage(f, f.name))}
            />
          )}
          <input
            ref={replaceInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void add(() => api.uploadStageImage(f, f.name));
            }}
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              icon="gallery"
              className="flex-1"
              disabled={busy}
              onClick={() => setPicking(true)}
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
          <Slider
            label="Denoise"
            value={s.denoise}
            onChange={(denoise) => set({ denoise })}
            min={0.01}
            max={1}
            step={0.01}
            defaultValue={0.75}
            marks={[0.5]}
          />
          {inpaint ? (
            <div className="grid grid-cols-2 gap-3">
              <Slider
                label="Grow mask"
                value={s.grow}
                onChange={(grow) => set({ grow })}
                min={0}
                max={128}
                unit="px"
                defaultValue={6}
              />
              <Slider
                label="Soften edge"
                value={s.blur}
                onChange={(blur) => set({ blur })}
                min={0}
                max={31}
                unit="px"
                defaultValue={4}
              />
            </div>
          ) : null}
          <GalleryPicker
            open={picking}
            onOpenChange={setPicking}
            onPick={(id) => {
              setPicking(false);
              void add(() => api.stageImageFromGallery(id));
            }}
          />
          {s.image ? (
            <MaskDialog
              open={painting}
              onOpenChange={setPainting}
              image={s.image}
              mask={s.mask}
              onSave={(mask) => set({ mask })}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function MaskDialog({
  open,
  onOpenChange,
  image,
  mask,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: StageImage;
  mask: StageImage | null;
  onSave: (mask: StageImage | null) => void;
}) {
  const painter = useRef<MaskPainterHandle>(null);
  const [saving, setSaving] = useState(false);
  // The painter's keys ([ ] X Ctrl+Z) win over the app's while it's open.
  useEffect(() => (open ? pauseShortcuts() : undefined), [open]);
  const save = async () => {
    const p = painter.current;
    if (!p) return;
    setSaving(true);
    try {
      if (p.isEmpty()) onSave(null);
      else {
        const blob = await p.toBlob();
        if (!blob) throw new Error("Couldn't read the mask. Try again.");
        onSave(await api.uploadStageImage(blob, `${image.label.replace(/\.[^.]+$/, "")}-mask.png`));
      }
      onOpenChange(false);
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Paint the mask"
      description="Paint over what should change. [ and ] change the brush, X swaps to the eraser."
      width={960}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" loading={saving} onClick={() => void save()}>
            Use this mask
          </Button>
        </>
      }
    >
      <MaskPainter
        ref={painter}
        src={stageImageUrl(image.file)}
        width={image.width}
        height={image.height}
        initialMask={mask ? stageImageUrl(mask.file) : null}
      />
    </Dialog>
  );
}

/**
 * "Start from this image" from the gallery: the first pass becomes Image to image (Inpaint stays
 * Inpaint, with a new mask to paint) and the image goes in.
 */
export async function sourceImageFromGallery(galleryId: number): Promise<boolean> {
  if (!useValues.getState().workflowId) {
    toast("Open Generate with a workflow first.", "warning");
    return false;
  }
  try {
    const image = await api.stageImageFromGallery(galleryId);
    const s = useValues.getState();
    const source = s.stages.source;
    const mode = source.mode === "inpaint" ? "inpaint" : "img2img";
    s.setStage("source", { ...source, mode, image, mask: null });
    toast(
      mode === "inpaint" ? "Ready to inpaint: paint the mask" : "The first pass starts from it",
      "success",
    );
    return true;
  } catch (e) {
    toast(message(e), "error");
    return false;
  }
}
