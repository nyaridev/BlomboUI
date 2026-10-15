/**
 * GPU stats for the header, at 1 Hz, only while a window is visible (ADR-0008). NVIDIA cards
 * are read with one long-running `nvidia-smi -lms 1000` process (cheap, and it has the
 * temperature). Without nvidia-smi it falls back to ComfyUI's /system_stats, which has VRAM
 * but no temperature.
 */
import { type ChildProcess, spawn } from "node:child_process";
import type { GpuStats, SystemStats } from "../../../shared/comfy.ts";
import type { ComfySystemStats } from "./client.ts";

const GIB = 1024 ** 3;
const MIB_PER_GIB = 1024;

/** One CSV line of `index,name,memory.used,memory.total,temperature.gpu,utilization.gpu`. */
export function parseNvidiaSmiLine(line: string): (GpuStats & { index: number }) | null {
  const parts = line.split(",").map((p) => p.trim());
  if (parts.length < 6) return null;
  const [index, name, used, total, temp, load] = parts;
  const n = (v: string | undefined) => {
    const x = Number(v);
    return v && Number.isFinite(x) ? x : null;
  };
  const usedMiB = n(used);
  const totalMiB = n(total);
  if (usedMiB === null || totalMiB === null) return null;
  return {
    index: n(index) ?? 0,
    name: name ?? "GPU",
    vramUsed: usedMiB / MIB_PER_GIB,
    vramTotal: totalMiB / MIB_PER_GIB,
    tempC: n(temp),
    load: n(load),
  };
}

export function gpuFromComfy(stats: ComfySystemStats): GpuStats | null {
  const dev = stats.devices?.find((d) => d.type !== "cpu") ?? null;
  if (!dev || typeof dev.vram_total !== "number" || typeof dev.vram_free !== "number") return null;
  return {
    name: (dev.name ?? "GPU").replace(/^cuda:\d+\s*/, "").replace(/\s*:\s*cudaMallocAsync$/, ""),
    vramUsed: (dev.vram_total - dev.vram_free) / GIB,
    vramTotal: dev.vram_total / GIB,
    tempC: null,
    load: null,
  };
}

export class StatsSampler {
  private readonly onStats: (stats: SystemStats) => void;
  private readonly comfyStats: () => Promise<ComfySystemStats | null>;
  private proc: ChildProcess | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private noSmi = process.platform === "darwin";
  private active = false;

  constructor(
    onStats: (stats: SystemStats) => void,
    comfyStats: () => Promise<ComfySystemStats | null>,
  ) {
    this.onStats = onStats;
    this.comfyStats = comfyStats;
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active) this.start();
    else this.stop();
  }

  private start(): void {
    if (this.noSmi) {
      this.startComfyFallback();
      return;
    }
    const proc = spawn(
      "nvidia-smi",
      [
        "--query-gpu=index,name,memory.used,memory.total,temperature.gpu,utilization.gpu",
        "--format=csv,noheader,nounits",
        "-lms",
        "1000",
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    this.proc = proc;
    let rest = "";
    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk: string) => {
      const lines = (rest + chunk).split(/\r?\n/);
      rest = lines.pop() ?? "";
      for (const line of lines) {
        const gpu = parseNvidiaSmiLine(line);
        if (gpu?.index !== 0) continue;
        const { index: _index, ...stats } = gpu;
        this.onStats({ at: Date.now(), gpu: stats, source: "nvidia-smi" });
      }
    });
    proc.on("error", () => {
      // No nvidia-smi (AMD, Intel, or not on PATH): use ComfyUI's numbers from now on.
      this.noSmi = true;
      if (this.proc === proc) this.proc = null;
      if (this.active) this.startComfyFallback();
    });
    proc.on("exit", () => {
      if (this.proc === proc) this.proc = null;
    });
  }

  private startComfyFallback(): void {
    if (this.timer) return;
    const tick = async () => {
      const stats = await this.comfyStats().catch(() => null);
      const gpu = stats ? gpuFromComfy(stats) : null;
      if (this.active) this.onStats({ at: Date.now(), gpu, source: gpu ? "comfy" : "none" });
    };
    void tick();
    this.timer = setInterval(() => void tick(), 1000);
  }

  private stop(): void {
    this.proc?.kill();
    this.proc = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
