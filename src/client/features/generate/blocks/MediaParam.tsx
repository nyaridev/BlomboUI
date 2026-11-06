/**
 * A workflow's own picture or video input (a Load Image or Load Video node: the character and the
 * video of a character swap). The file is kept with the stage files in the profile, and the value
 * is its name; the queue sends it to ComfyUI's input folder before each run. A value that isn't
 * one of Blombo's files is a name in ComfyUI's input folder, shown as it is.
 */
import { api, stageImageUrl } from "@client/lib/api";
import { Button, DropZone, Field, toast } from "@client/ui";
import type { Binding } from "@shared/workflow/manifest";
import { isStageFile } from "@shared/workflow/stages";
import { useRef, useState } from "react";
import { useMediaSizes } from "../mediaSizes";
import { useValue } from "../state";
import { GalleryPicker, useLastOutput, useLastVideo } from "./stages/images";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function MediaParam({ binding, label }: { binding: Binding; label?: string }) {
  const [value, setValue] = useValue<unknown>(binding.id);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);
  const video = binding.type === "video";
  const lastImage = useLastOutput();
  const lastVideo = useLastVideo();
  const last = video ? lastVideo : lastImage;
  const file = typeof value === "string" ? value : "";
  const ours = isStageFile(file);
  const accept = video ? "video/mp4" : "image/png,image/jpeg,image/webp";
  const size = useMediaSizes((s) => s.sizes[file]);
  const setSize = useMediaSizes((s) => s.set);

  const add = async (work: () => Promise<{ file: string }>) => {
    setBusy(true);
    try {
      setValue((await work()).file);
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const upload = (f: File) =>
    void add(() => (video ? api.uploadStageVideo(f, f.name) : api.uploadStageImage(f, f.name)));

  return (
    <Field label={label ?? binding.label}>
      <div className="flex flex-col gap-2">
        {file ? (
          <div className="flex gap-3 max-sm:flex-col">
            <div className="relative h-28 w-40 shrink-0 overflow-hidden rounded-md border border-line bg-sunken max-sm:w-full">
              {!ours ? (
                <span className="absolute inset-0 grid place-items-center p-2 text-center text-2xs text-fg-3">
                  In ComfyUI's input folder
                </span>
              ) : video ? (
                <video
                  src={stageImageUrl(file)}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    setSize(file, { w: v.videoWidth, h: v.videoHeight, seconds: v.duration });
                  }}
                  onPointerEnter={(e) => void e.currentTarget.play().catch(() => {})}
                  onPointerLeave={(e) => e.currentTarget.pause()}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : (
                <img
                  src={stageImageUrl(file)}
                  alt={binding.label}
                  onLoad={(e) => {
                    const i = e.currentTarget;
                    setSize(file, { w: i.naturalWidth, h: i.naturalHeight, seconds: null });
                  }}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="truncate font-mono text-2xs text-fg-3" title={file}>
                {file}
              </span>
              {size ? (
                <span className="font-mono text-2xs text-fg-2 tabular">
                  {size.w} × {size.h}
                  {size.seconds ? ` · ${size.seconds.toFixed(1)} s` : ""}
                </span>
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
                <Button size="sm" variant="ghost" icon="x" onClick={() => setValue("")}>
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <DropZone
            compact
            busy={busy}
            accept={accept}
            title={
              video ? "Drop a video or click to pick one" : "Drop an image or click to pick one"
            }
            hint={video ? "An MP4" : "A PNG, JPEG or WebP"}
            onFile={upload}
          />
        )}
        <input
          ref={replaceInput}
          type="file"
          accept={accept}
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
            icon={video ? "play" : "image"}
            className="flex-1"
            disabled={busy || !last}
            title={last ? undefined : video ? "Generate a video first" : "Generate something first"}
            onClick={() =>
              last &&
              void add(() =>
                video ? api.stageVideoFromOutput(last) : api.stageImageFromOutput(last),
              )
            }
          >
            Last output
          </Button>
        </div>
        <GalleryPicker
          open={picking}
          onOpenChange={setPicking}
          media={video ? "video" : "image"}
          onPick={(id) => {
            setPicking(false);
            void add(() => (video ? api.stageVideoFromGallery(id) : api.stageImageFromGallery(id)));
          }}
        />
      </div>
    </Field>
  );
}
