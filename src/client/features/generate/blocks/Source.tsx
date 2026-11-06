/**
 * The first pass's mode (the `source` stage): Text to image starts from an empty latent; Image to
 * image from a picture, fitted to the workflow's size (cropped) at a denoise; Inpaint also takes a
 * painted mask, so only that part is redrawn. The image comes from a file, the gallery or the
 * last output, and is kept in the profile like a ControlNet image. Sits at the top of the First
 * pass card (a layout feature, `source`). The mode is picked from that card's tab menu
 * (ParamsColumn, `SourceInTab`); a layout without the tab gets a Start from dropdown here.
 * Video workflows start from text, a first frame, or a first and a last frame instead, or
 * continue a video (its last frames start the new part, and the result is the whole video); the
 * modes listed are the ones the workflow has a package for (`WorkflowDetail.sourceModes`).
 */
import { pauseShortcuts } from "@client/app/useShortcuts";
import { api, stageImageUrl } from "@client/lib/api";
import { qk, queryClient } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
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
import type { WorkflowDetail } from "@shared/workflow/manifest";
import {
  type SourceMode,
  type StageImage,
  type StageVideo,
  sourceModeLabel,
} from "@shared/workflow/stages";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useStage, useValues } from "../state";
import { useRoleBinding, useSourceModes } from "../workflow";
import { StageNotices, useStageStatus } from "./stages/common";
import { GalleryPicker, useLastOutput, useLastVideo } from "./stages/images";

/** True inside a pass tab whose menu picks the mode, so the block leaves out its own dropdown. */
export const SourceInTab = createContext(false);

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const HINTS: Record<SourceMode, string> = {
  txt2img: "Starts from noise: the prompt makes the whole image.",
  img2img: "Starts from your image: low denoise keeps it, high denoise changes more.",
  inpaint: "Redraws only the part you paint; the rest stays as it is.",
  first: "The video starts from your picture and the prompt says what happens next.",
  firstLast: "The video starts from one picture and ends on the other.",
  extend:
    "Picks up where your video ends: the new part follows its last frames, and the result is the whole video.",
};

const VIDEO_MODES: SourceMode[] = ["first", "firstLast", "extend"];

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
  const video = VIDEO_MODES.includes(s.mode);
  const inTab = useContext(SourceInTab);
  const { media, modes } = useSourceModes();
  const label = (m: SourceMode) => sourceModeLabel(m, media);

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
      {inTab ? (
        on ? (
          <p className="text-xs text-fg-3">
            <span className="font-medium text-fg-2">{label(s.mode)}</span> · {HINTS[s.mode]} Switch
            back to {label("txt2img")} from the tab's menu.
          </p>
        ) : null
      ) : (
        <Field
          label="Start from"
          hint={s.mode === "txt2img" && media === "video" ? undefined : HINTS[s.mode]}
        >
          <Select
            value={s.mode}
            onChange={(mode) => set({ mode })}
            options={modes.map((m) => ({ value: m, label: label(m) }))}
            aria-label="What the first pass starts from"
          />
        </Field>
      )}
      {on && video ? (
        <>
          <StageNotices status={status} />
          {s.mode === "extend" ? (
            <VideoWell video={s.video} onChange={(video) => set({ video })} />
          ) : (
            <FrameWell
              title="First frame"
              image={s.image}
              sized={sized ? `${w}×${h}` : null}
              onChange={(image) => set({ image })}
            />
          )}
          {s.mode === "firstLast" ? (
            <FrameWell
              title="Last frame"
              image={s.last}
              sized={sized ? `${w}×${h}` : null}
              onChange={(last) => set({ last })}
            />
          ) : null}
        </>
      ) : on ? (
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

/** One frame of a video mode: a picture from a file, the gallery or the last output. */
function FrameWell({
  title,
  image,
  sized,
  onChange,
}: {
  title: string;
  image: StageImage | null;
  /** The workflow's size ("1280×704"), which the frame is fitted to. */
  sized: string | null;
  onChange: (image: StageImage | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);
  const last = useLastOutput();
  const add = async (work: () => Promise<StageImage>) => {
    setBusy(true);
    try {
      onChange(await work());
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="label-caps">{title}</span>
      {image ? (
        <div className="flex gap-3 max-sm:flex-col">
          <div className="relative h-28 w-40 shrink-0 overflow-hidden rounded-md border border-line bg-sunken max-sm:w-full">
            <img
              src={stageImageUrl(image.file)}
              alt={image.label}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="truncate font-mono text-2xs text-fg-3" title={image.label}>
              {image.label} · {image.width}×{image.height}
            </span>
            {sized ? (
              <span className="text-xs text-fg-3">Fitted to {sized} (cropped to fill).</span>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                icon="upload"
                disabled={busy}
                onClick={() => replaceInput.current?.click()}
              >
                Replace
              </Button>
              <Button size="sm" variant="ghost" icon="x" onClick={() => onChange(null)}>
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
          hint={title === "Last frame" ? "Where the video ends" : "Where the video starts"}
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

/** Continue a video: the video so far, from a file, the gallery or the last output. */
function VideoWell({
  video,
  onChange,
}: {
  video: StageVideo | null;
  onChange: (video: StageVideo | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);
  const last = useLastVideo();
  const add = async (work: () => Promise<StageVideo>) => {
    setBusy(true);
    try {
      onChange(await work());
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const upload = (f: File) => void add(() => api.uploadStageVideo(f, f.name));
  return (
    <div className="flex flex-col gap-2">
      <span className="label-caps">Video so far</span>
      {video ? (
        <div className="flex gap-3 max-sm:flex-col">
          <div className="relative h-28 w-40 shrink-0 overflow-hidden rounded-md border border-line bg-sunken max-sm:w-full">
            <video
              src={stageImageUrl(video.file)}
              muted
              loop
              playsInline
              preload="metadata"
              onPointerEnter={(e) => void e.currentTarget.play().catch(() => {})}
              onPointerLeave={(e) => e.currentTarget.pause()}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="truncate font-mono text-2xs text-fg-3" title={video.label}>
              {video.label}
              {video.width ? ` · ${video.width}×${video.height}` : ""}
              {video.duration ? ` · ${Math.round(video.duration * 10) / 10} s` : ""}
            </span>
            <span className="text-xs text-fg-3">
              The new part starts from its last frames; the result is the whole video.
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                icon="upload"
                disabled={busy}
                onClick={() => replaceInput.current?.click()}
              >
                Replace
              </Button>
              <Button size="sm" variant="ghost" icon="x" onClick={() => onChange(null)}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <DropZone
          compact
          busy={busy}
          accept="video/mp4"
          title="Drop a video or click to pick one"
          hint="An MP4 to continue, such as one made here"
          onFile={upload}
        />
      )}
      <input
        ref={replaceInput}
        type="file"
        accept="video/mp4"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
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
          icon="play"
          className="flex-1"
          disabled={busy || !last}
          title={last ? undefined : "Generate a video first"}
          onClick={() => last && void add(() => api.stageVideoFromOutput(last))}
        >
          Last output
        </Button>
      </div>
      <GalleryPicker
        open={picking}
        onOpenChange={setPicking}
        media="video"
        onPick={(id) => {
          setPicking(false);
          void add(() => api.stageVideoFromGallery(id));
        }}
      />
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
 * Inpaint, with a new mask to paint) and the image goes in. A video workflow takes it as its first
 * frame (First and last frame stays, keeping its last frame).
 */
/** The gallery viewer's Continue it: the open workflow's first pass continues this video. */
export async function sourceVideoFromGallery(galleryId: number): Promise<boolean> {
  const s = useValues.getState();
  if (!s.workflowId) {
    toast("Open Generate with a video workflow first.", "warning");
    return false;
  }
  const detail = queryClient.getQueryData<WorkflowDetail>(
    qk.workflow(useSession.getState().profileId, s.workflowId),
  );
  if (detail && !detail.sourceModes.includes("extend")) {
    toast(
      "The open workflow can't continue a video. Open Wan 2.2, LTX-2.3 or MiniMax H3 on Generate first.",
      "warning",
    );
    return false;
  }
  try {
    const video = await api.stageVideoFromGallery(galleryId);
    const now = useValues.getState();
    now.setStage("source", { ...now.stages.source, mode: "extend", video });
    toast("The next video continues it", "success");
    return true;
  } catch (e) {
    toast(message(e), "error");
    return false;
  }
}

export async function sourceImageFromGallery(galleryId: number): Promise<boolean> {
  if (!useValues.getState().workflowId) {
    toast("Open Generate with a workflow first.", "warning");
    return false;
  }
  try {
    const image = await api.stageImageFromGallery(galleryId);
    const s = useValues.getState();
    const source = s.stages.source;
    const detail = queryClient.getQueryData<WorkflowDetail>(
      qk.workflow(useSession.getState().profileId, s.workflowId),
    );
    const modes = detail?.sourceModes ?? [];
    const mode: SourceMode =
      detail?.media === "video"
        ? source.mode === "firstLast"
          ? "firstLast"
          : "first"
        : source.mode === "inpaint"
          ? "inpaint"
          : "img2img";
    if (detail && !modes.includes(mode)) {
      toast("This workflow can't start from an image.", "warning");
      return false;
    }
    s.setStage("source", { ...source, mode, image, mask: null });
    toast(
      mode === "inpaint"
        ? "Ready to inpaint: paint the mask"
        : mode === "img2img"
          ? "The first pass starts from it"
          : "The video starts from it",
      "success",
    );
    return true;
  } catch (e) {
    toast(message(e), "error");
    return false;
  }
}
