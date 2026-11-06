/**
 * The lines under a swap's size and length settings: what a run will make from its input video
 * (the video's shape at the megapixels set; the window of it, its frames and how many parts it
 * runs in). Worked out with the same helpers the server uses (`scaleToMegapixels`,
 * `videoParts`), from the video's header (`useStageVideoInfo`).
 */
import { useStageVideoInfo } from "@client/lib/queries";
import { scaleToMegapixels } from "@shared/sizes";
import { videoParts } from "@shared/videoparts";
import { useValues } from "../state";
import { useRoleBinding } from "../workflow";

/** 75.5 → "1:15.5". */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round((seconds - m * 60) * 10) / 10;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function useRole(role: string): unknown {
  const id = useRoleBinding(role)?.id ?? "";
  return useValues((s) => (id ? s.values[id] : undefined));
}

/** The input video's header, when it's one of Blombo's files. */
function useInputVideo() {
  const file = useRole("video.input");
  return useStageVideoInfo(typeof file === "string" ? file : "").data;
}

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-fg-2 tabular">{children}</span>
);

/** Under Size (megapixels): the size a run makes, in the video's shape. */
export function OutputSize({ megapixels }: { megapixels: string }) {
  const mp = useValues((s) => Number(s.values[megapixels]));
  const video = useInputVideo();
  // shortcut: rounds to 32 px like both swap presets; a workflow with another step is a few px off.
  const out =
    video?.width && video.height && Number.isFinite(mp)
      ? scaleToMegapixels({ w: video.width, h: video.height }, mp, 32)
      : null;
  return (
    <p className="text-xs text-fg-3">
      {out && video ? (
        <>
          Makes{" "}
          <Mono>
            {out.w} × {out.h}
          </Mono>
          , the shape of the {video.width} × {video.height} video. More megapixels: sharper, slower.
        </>
      ) : (
        "The size follows the input video's shape. More megapixels: sharper, slower."
      )}
    </p>
  );
}

/** Under Length (seconds): which part of the video a run takes, its frames and parts. */
export function VideoPlan() {
  const video = useInputVideo();
  const start = Number(useRole("video.start")) || 0;
  const seconds = Number(useRole("video.seconds")) || 0;
  const partFrames = Number(useRole("video.frames")) || Number.POSITIVE_INFINITY;
  // A model with its own frame rate (MiniMax H3 makes 24 fps) says so; otherwise the video's.
  const madeFps = Number(useRole("video.fps")) || null;
  if (!video?.duration || !video.fps)
    return (
      <p className="text-xs text-fg-3">
        Only this part of the video is read, so a long video doesn't fill the memory.
      </p>
    );
  const plan = videoParts(
    { start, seconds },
    { seconds: video.duration, fps: video.fps },
    partFrames,
  );
  const fps = madeFps ?? video.fps;
  const frames = madeFps ? Math.round(plan.seconds * madeFps) : plan.frames;
  return (
    <p className="text-xs text-fg-3">
      Takes{" "}
      <Mono>
        {clock(plan.start)}–{clock(plan.start + plan.seconds)}
      </Mono>{" "}
      of the {clock(video.duration)} video: {madeFps ? "about " : ""}
      <Mono>{frames}</Mono> frames at {Math.round(fps)} fps
      {plan.parts > 1 ? (
        <>
          , in <Mono>{plan.parts}</Mono> parts one after the other, each continuing the last
        </>
      ) : null}
      . Only this part is read.
      {plan.shortened ? ` At most ${plan.parts} parts in one go, so it stops there.` : ""}
    </p>
  );
}
