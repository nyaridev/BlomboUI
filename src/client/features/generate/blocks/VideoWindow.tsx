/**
 * The lines under a swap's size and length settings: what a run will make from its input video
 * (the video's shape at the megapixels set; the window of it, its frames and how many parts it
 * runs in), and Parts, which repeats Length, each part continuing the last. Worked out with the
 * same helpers the server uses (`scaleToMegapixels`, `swapWindow`), from the video's header
 * (`useStageVideoInfo`). Parts is the Long video script's (Scripts block), so its prompts per part
 * work here too.
 */
import { useStageVideoInfo } from "@client/lib/queries";
import { Slider } from "@client/ui";
import { MAX_SEGMENTS } from "@shared/scripts";
import { scaleToMegapixels } from "@shared/sizes";
import { swapWindow } from "@shared/videoparts";
import { useScript } from "../scripts";
import { useValues } from "../state";
import { useRoleBinding, useSourceModes } from "../workflow";

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

/** Long video's parts (1 when it's off), and a setter that turns it on and off. */
function useParts(): [number, (parts: number) => void] {
  const parts = useScript((s) =>
    s.draft.on && s.draft.kind === "long" ? s.draft.long.segments : 1,
  );
  const set = (n: number) => {
    const { draft, set: setDraft, setLong } = useScript.getState();
    if (n > 1) {
      setLong({ segments: n });
      setDraft({ on: true, kind: "long" });
    } else if (draft.kind === "long") setDraft({ on: false });
  };
  return [parts, set];
}

/**
 * Under Length (seconds): Parts (when the workflow can continue a video), and which part of the
 * video a click takes, its frames and runs.
 */
export function VideoPlan() {
  const canExtend = useSourceModes().modes.includes("extend");
  const [parts, setParts] = useParts();
  return (
    <div className="flex flex-col gap-1.5">
      {canExtend ? (
        <Slider
          label="Parts"
          field
          size="sm"
          min={1}
          max={MAX_SEGMENTS}
          value={parts}
          defaultValue={1}
          onChange={setParts}
        />
      ) : null}
      <VideoPlanText parts={canExtend ? parts : 1} />
    </div>
  );
}

function VideoPlanText({ parts }: { parts: number }) {
  const video = useInputVideo();
  const start = Number(useRole("video.start")) || 0;
  const seconds = Number(useRole("video.seconds")) || 0;
  const most = Number(useRole("video.frames")) || Number.POSITIVE_INFINITY;
  // A model with its own frame rate (MiniMax H3 makes 24 fps) says so; otherwise the video's.
  const madeFps = Number(useRole("video.fps")) || null;
  if (!video?.duration || !video.fps)
    return (
      <p className="text-xs text-fg-3">
        Only this part of the video is read, so a long video doesn't fill the memory.
        {parts > 1 ? ` Parts repeat Length, each continuing the last.` : ""}
      </p>
    );
  const fps = madeFps ?? video.fps;
  const plan = swapWindow(
    { start, seconds },
    parts,
    { seconds: video.duration, fps: video.fps },
    fps,
    most,
  );
  const repeat = parts > 1 && seconds > 0;
  return (
    <p className="text-xs text-fg-3">
      Takes{" "}
      <Mono>
        {clock(plan.start)}–{clock(plan.start + plan.seconds)}
      </Mono>{" "}
      of the {clock(video.duration)} video: {madeFps ? "about " : ""}
      <Mono>{plan.frames}</Mono> frames at {Math.round(fps)} fps
      {repeat ? (
        <>
          , as <Mono>{parts}</Mono> parts of {seconds} s, each continuing from the last one's final
          frames
          {plan.parts > parts ? (
            <>
              {" "}
              (<Mono>{plan.parts}</Mono> runs: one makes at most {Math.round(plan.part * 10) / 10}{" "}
              s)
            </>
          ) : null}
        </>
      ) : plan.parts > 1 ? (
        <>
          , in <Mono>{plan.parts}</Mono> parts one after the other, each continuing the last
        </>
      ) : null}
      . Only this part is read.
      {plan.shortened ? ` At most ${plan.parts} runs in one go, so it stops there.` : ""}
      {repeat && plan.parts < 2 ? " The video ends before a second part, so it runs once." : ""}
    </p>
  );
}
