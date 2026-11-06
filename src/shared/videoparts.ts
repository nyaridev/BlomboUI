/**
 * A workflow that reads a video (the character swaps) takes only a window of it: from `start` for
 * `seconds`, cut before ComfyUI decodes it, so a long file never fills the memory. When the window
 * holds more frames than one run makes (`partFrames`, SCAIL's 81), it's swapped in parts: each
 * next part is a Continue a video run whose window starts `PART_OVERLAP` frames before the end of
 * the video so far, so the frames line up. Used by Generate (what a run will make), the queue
 * (how many parts) and the splicer (each part's window).
 */

/** Frames each next part shares with the video so far (SCAIL anchors on the last 5). */
export const PART_OVERLAP = 5;
/** The most parts one Generate click runs; each re-reads the whole video so far. */
export const MAX_PARTS = 12;

export interface VideoWindow {
  /** Seconds into the file. */
  start: number;
  /** Seconds to take (0: to the end). */
  seconds: number;
}

export interface VideoParts extends VideoWindow {
  /** Frames the window holds. */
  frames: number;
  parts: number;
  /** More parts were needed than MAX_PARTS: the window was shortened to fit. */
  shortened: boolean;
}

/**
 * What a window of a video makes: its real start and length (inside the file), its frames and how
 * many parts. `fileSeconds` is the file's length, `fps` its frame rate.
 */
export function videoParts(
  want: VideoWindow,
  file: { seconds: number; fps: number },
  partFrames: number,
): VideoParts {
  const start = Math.min(Math.max(0, want.start), Math.max(0, file.seconds - 1 / file.fps));
  const room = file.seconds - start;
  const seconds = want.seconds > 0 ? Math.min(want.seconds, room) : room;
  let frames = Math.max(1, Math.round(seconds * file.fps));
  const step = Math.max(1, partFrames - PART_OVERLAP);
  const count = (n: number) => (n <= partFrames ? 1 : 1 + Math.ceil((n - partFrames) / step));
  let shortened = false;
  if (count(frames) > MAX_PARTS) {
    frames = partFrames + (MAX_PARTS - 1) * step;
    shortened = true;
  }
  return {
    start,
    seconds: shortened ? frames / file.fps : seconds,
    frames,
    parts: count(frames),
    shortened,
  };
}

/**
 * The window one part reads. The first (nothing made yet) starts at the wanted start; a next one
 * starts PART_OVERLAP frames before the end of the `madeFrames` so far (a quarter frame early, so
 * the decoder's rounding never skips the first one). Each holds at most `partFrames` and never
 * runs past the wanted end.
 */
export function partWindow(
  want: VideoWindow,
  fps: number,
  partFrames: number,
  madeFrames: number,
): VideoWindow {
  const start = madeFrames > 0 ? want.start + (madeFrames - PART_OVERLAP - 0.25) / fps : want.start;
  const longest = partFrames / fps;
  const left = want.seconds > 0 ? want.start + want.seconds - start : longest;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { start: r(Math.max(0, start)), seconds: r(Math.max(1 / fps, Math.min(longest, left))) };
}
