/**
 * PREVIEW: fake live system numbers so the header can be reviewed in motion. Replaced by the
 * `system` topic of the live bus (ADR-0008) in Phase 1.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { MOCK_ERRORS } from "./mock";

export type ComfyState = "running" | "starting" | "restarting" | "stopped" | "missing";

interface SystemPreview {
  vramUsed: number;
  vramTotal: number;
  tempC: number;
  comfy: ComfyState;
  errors: typeof MOCK_ERRORS;
  queue: number;
  running: boolean;
  progress: number;
  set: (patch: Partial<SystemPreview>) => void;
}

export const useSystemPreview = create<SystemPreview>((set) => ({
  vramUsed: 9.4,
  vramTotal: 24,
  tempC: 58,
  comfy: "running",
  errors: MOCK_ERRORS,
  queue: 0,
  running: false,
  progress: 0,
  set: (patch) => set(patch),
}));

/** Gentle drift of VRAM and temperature, and a progress loop while "running". */
export function useSystemPreviewTicker() {
  useEffect(() => {
    const t = window.setInterval(() => {
      const s = useSystemPreview.getState();
      const busy = s.running;
      const target = busy ? 17.8 : 9.4;
      const vram = s.vramUsed + (target - s.vramUsed) * 0.35 + (Math.random() - 0.5) * 0.3;
      const tempTarget = busy ? 74 : 56;
      const temp = Math.round(s.tempC + (tempTarget - s.tempC) * 0.25 + (Math.random() - 0.5) * 2);
      let progress = s.progress;
      let running = s.running;
      let queue = s.queue;
      if (busy) {
        progress = Math.min(1, progress + 0.045 + Math.random() * 0.03);
        if (progress >= 1) {
          if (queue > 0) {
            queue -= 1;
            progress = 0;
          } else {
            running = false;
          }
        }
      }
      s.set({
        vramUsed: Math.max(0.5, Math.min(s.vramTotal, vram)),
        tempC: temp,
        progress,
        running,
        queue,
      });
    }, 700);
    return () => window.clearInterval(t);
  }, []);
}
