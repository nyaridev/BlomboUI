/**
 * How long each part of a run takes and how fast it samples, from ComfyUI's socket events.
 * `executing` says which node started (it ends the one before); `progress` counts a node's
 * steps. Time spent in a segment's sampler nodes (the base pass, a stage) is that segment's;
 * everything else (loading models, decoding, saving) is "Other". Pure, so it's testable with
 * made-up clocks.
 */
import type { JobTiming } from "../../shared/jobs.ts";
import type { RunSegment } from "../../shared/workflow/stages.ts";

interface OpenNode {
  node: string;
  at: number;
  /** Steps finished in earlier passes of this node (a detailer runs once per face). */
  done: number;
  last: number;
}

export class RunClock {
  private segments: RunSegment[];
  private readonly startedAt: number;
  private open: OpenNode | null = null;
  private readonly per = new Map<number, { ms: number; steps: number }>();

  constructor(segments: RunSegment[], now: number) {
    this.segments = segments;
    this.startedAt = now;
  }

  setSegments(segments: RunSegment[]): void {
    this.segments = segments;
  }

  private segmentOf(node: string): number {
    return this.segments.findIndex((s) => s.nodes.includes(node));
  }

  private close(now: number): void {
    const open = this.open;
    this.open = null;
    if (!open) return;
    const seg = this.segmentOf(open.node);
    const steps = open.done + open.last;
    // Nodes outside every segment are "Other", unless they reported steps (an unknown sampler
    // then counts toward the base pass so its speed isn't lost).
    const index = seg >= 0 ? seg : steps > 0 ? 0 : -1;
    if (index < 0) return;
    const entry = this.per.get(index) ?? { ms: 0, steps: 0 };
    entry.ms += Math.max(0, now - open.at);
    entry.steps += steps;
    this.per.set(index, entry);
  }

  /** ComfyUI started a node (null: the prompt is done). */
  executing(node: string | null, now: number): void {
    if (this.open?.node === node) return;
    this.close(now);
    if (node !== null) this.open = { node, at: now, done: 0, last: 0 };
  }

  /** A step of `node`; returns its steps per second so far (null before there's a rate). */
  progress(node: string | null, value: number, now: number): number | null {
    if (node === null) return null;
    // Without an `executing` first (older ComfyUI, some custom samplers) the node starts now.
    if (this.open?.node !== node) this.executing(node, now);
    const open = this.open as OpenNode;
    if (value < open.last) open.done += open.last;
    open.last = value;
    const secs = (now - open.at) / 1000;
    const steps = open.done + open.last;
    return secs > 0 && steps > 0 ? steps / secs : null;
  }

  /** Timings so far (or final, after `finish`): segments that ran, then "Other". */
  timings(now: number): JobTiming[] {
    const out: JobTiming[] = [];
    let inSegments = 0;
    const live = this.open;
    for (const [i, seg] of this.segments.entries()) {
      const entry = { ...(this.per.get(i) ?? { ms: 0, steps: 0 }) };
      if (live) {
        const s = this.segmentOf(live.node);
        if (s === i || (s < 0 && i === 0 && live.done + live.last > 0)) {
          entry.ms += Math.max(0, now - live.at);
          entry.steps += live.done + live.last;
        }
      }
      if (entry.ms <= 0 && entry.steps <= 0) continue;
      inSegments += entry.ms;
      out.push({
        label: seg.label,
        ms: Math.round(entry.ms),
        steps: entry.steps,
        rate: entry.steps > 0 && entry.ms > 0 ? entry.steps / (entry.ms / 1000) : null,
      });
    }
    const other = Math.max(0, now - this.startedAt - inSegments);
    if (other > 0) out.push({ label: "Other", ms: Math.round(other), steps: 0, rate: null });
    return out;
  }

  finish(now: number): JobTiming[] {
    this.close(now);
    return this.timings(now);
  }
}
