/**
 * Builds the server's services and wires them together: the supervisor's ComfyUI events feed
 * the job queue and the live bus, the bus decides when GPU stats are sampled and logs are
 * followed, finished images go into the gallery index, and opening a profile points everything
 * (ComfyUI, the gallery database, the model list) at that profile.
 */
import { randomUUID } from "node:crypto";
import type { AppError } from "../shared/live.ts";
import type { ServerConfig } from "./config.ts";
import { ComfyInstaller } from "./services/comfy/installer.ts";
import { StatsSampler } from "./services/comfy/stats.ts";
import { ComfySupervisor } from "./services/comfy/supervisor.ts";
import { GalleryService } from "./services/gallery/index.ts";
import { JobQueue } from "./services/jobs.ts";
import { LiveBus } from "./services/live.ts";
import { ModelService } from "./services/models.ts";
import { ProfileService } from "./services/profiles.ts";
import { SettingsService } from "./services/settings.ts";
import { installPreset } from "./services/workflows/presets.ts";
import { WorkflowService } from "./services/workflows/store.ts";

export interface Services {
  config: ServerConfig;
  profiles: ProfileService;
  supervisor: ComfySupervisor;
  workflows: WorkflowService;
  queue: JobQueue;
  bus: LiveBus;
  settings: SettingsService;
  gallery: GalleryService;
  models: ModelService;
  installer: ComfyInstaller;
  /** Install starter presets into a new profile; unknown ids are skipped with a warning. */
  installPresets: (profileId: string, presetIds: string[]) => Promise<void>;
  shutdown: () => Promise<void>;
}

export function createServices(config: ServerConfig): Services {
  const profiles = new ProfileService(config);
  const workflows = new WorkflowService(profiles);
  const supervisor = new ComfySupervisor({ runtimeDir: config.runtimeDir, keepAlive: config.dev });

  // The bus greets each window with the current state; the queue is created right after.
  let queue: JobQueue | null = null;
  const bus = new LiveBus(() => ({
    t: "hello",
    comfy: supervisor.status(),
    queue: queue?.snapshot() ?? { jobs: [], loop: false, waiting: false },
    profileId: profiles.active,
  }));

  const settings = new SettingsService((id) => profiles.dir(id));
  const gallery = new GalleryService({
    profiles,
    settings,
    runtimeDir: config.runtimeDir,
    publish: (topic, msg) => bus.publish(topic, msg),
    workflowExists: (id) =>
      workflows.get(id).then(
        () => true,
        () => false,
      ),
  });
  const models = new ModelService({
    profiles,
    runtimeDir: config.runtimeDir,
    onChanged: () => {
      supervisor.refreshObjectInfo();
      bus.publish(null, { t: "models.changed" });
    },
  });
  const installer = new ComfyInstaller(config.runtimeDir);
  installer.on("state", (install) => bus.publish("install", { t: "install", install }));
  installer.on("installed", (slot) => {
    const s = supervisor.status();
    // The open profile was waiting for this slot: start it now.
    if (s.mode === "managed" && s.slot === slot && s.state === "missing") void supervisor.start();
  });

  const reportError = (source: AppError["source"], title: string, detail: string) =>
    bus.publish(null, {
      t: "error",
      error: { id: randomUUID(), at: Date.now(), source, title, detail },
    });

  queue = new JobQueue({
    supervisor,
    workflows,
    profiles,
    publish: (topic, msg) => {
      bus.publish(topic, msg);
      // New outputs appear in the gallery as they land, without a rescan.
      if (msg.t === "job.image")
        void gallery
          .ingestOutput(msg.image)
          .catch((error) => console.warn("Couldn't index a new image:", error));
    },
    publishBinary: (topic, frame) => bus.publishBinary(topic, frame),
    reportError,
  });
  const jobs = queue;

  supervisor.on("status", (status) => {
    bus.publish("comfy", { t: "comfy.status", status });
    if (status.state === "crashed")
      reportError("comfy", "ComfyUI stopped unexpectedly", status.message ?? "");
  });
  supervisor.on("log", (lines) => bus.publish("logs", { t: "comfy.log", lines }));
  bus.on("logs", (any) => supervisor.followLogs(any));

  const stats = new StatsSampler(
    (s) => bus.publish("system", { t: "system", stats: s }),
    async () => (supervisor.api ? supervisor.api.systemStats().catch(() => null) : null),
  );
  bus.on("visible", (any) => stats.setActive(any));

  profiles.on("opened", (profile, previousId) => {
    void (async () => {
      await workflows.flush();
      if (previousId !== profile.id) await jobs.reset();
      models.invalidate();
      await gallery.open(profile.id);
      gallery.startSync();
      await supervisor.applyProfile(profile);
      bus.publish(null, { t: "profile.switched", profileId: profile.id });
    })().catch((error) => console.error("Opening the profile failed:", error));
  });
  profiles.on("updated", (profile) => {
    if (profile.id !== profiles.active) return;
    void supervisor.applyProfile(profile, "flag").catch((error) => console.error(error));
    models.invalidate();
    gallery.startSync();
  });

  return {
    config,
    profiles,
    supervisor,
    workflows,
    queue: jobs,
    bus,
    settings,
    gallery,
    models,
    installer,
    installPresets: async (profileId, presetIds) => {
      for (const id of presetIds) {
        try {
          await installPreset(config.presetsDir, workflows, id, profileId);
        } catch (error) {
          console.warn(
            `Preset "${id}" wasn't installed: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    },
    shutdown: async () => {
      stats.setActive(false);
      installer.cancel();
      await workflows.flush().catch(() => undefined);
      await gallery.close().catch(() => undefined);
      await supervisor.shutdown().catch(() => undefined);
      bus.close();
    },
  };
}
