/**
 * Builds the server's services and wires them together: the supervisor's ComfyUI events feed
 * the job queue and the live bus, the bus decides when GPU stats are sampled and logs are
 * followed, finished images go into the gallery index, finished downloads refresh the model
 * lists, and opening a profile points everything (ComfyUI, the profile database, the model
 * list, the download queue, the Civitai lookup) at that profile.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AppError } from "../shared/live.ts";
import type { ServerConfig } from "./config.ts";
import { ProfileDbs } from "./db/profileDb.ts";
import { AutocompleteService } from "./services/autocomplete.ts";
import { CivitaiApi } from "./services/civitai/api.ts";
import { ImageProxy } from "./services/civitai/images.ts";
import { CivitaiService } from "./services/civitai/index.ts";
import { ComfyInstaller } from "./services/comfy/installer.ts";
import { StatsSampler } from "./services/comfy/stats.ts";
import { ComfySupervisor } from "./services/comfy/supervisor.ts";
import { DownloadQueue } from "./services/downloads.ts";
import { GalleryService } from "./services/gallery/index.ts";
import { JobQueue } from "./services/jobs.ts";
import { LayoutService } from "./services/layouts.ts";
import { LiveBus } from "./services/live.ts";
import { ModelLookup } from "./services/lookup.ts";
import { ManagerCatalog } from "./services/manager.ts";
import { ModelService } from "./services/models.ts";
import { ProfileService } from "./services/profiles.ts";
import { SettingsService } from "./services/settings.ts";
import { StageService } from "./services/stages.ts";
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
  dbs: ProfileDbs;
  civitai: CivitaiService;
  lookup: ModelLookup;
  catalog: ManagerCatalog;
  downloads: DownloadQueue;
  layouts: LayoutService;
  stages: StageService;
  autocomplete: AutocompleteService;
  /** Install starter presets into a new profile; unknown ids are skipped with a warning. */
  installPresets: (profileId: string, presetIds: string[]) => Promise<void>;
  shutdown: () => Promise<void>;
}

export function createServices(config: ServerConfig): Services {
  const profiles = new ProfileService(config);
  const workflows = new WorkflowService(profiles);
  const supervisor = new ComfySupervisor({ runtimeDir: config.runtimeDir, keepAlive: config.dev });

  // The bus greets each window with the current state; the queues are created right after.
  let queue: JobQueue | null = null;
  let downloadQueue: DownloadQueue | null = null;
  const bus = new LiveBus(() => ({
    t: "hello",
    comfy: supervisor.status(),
    queue: queue?.snapshot() ?? { jobs: [], loop: false, waiting: false },
    profileId: profiles.active,
    downloads: downloadQueue?.snapshot(),
  }));

  const settings = new SettingsService((id) => profiles.dir(id));
  const dbs = new ProfileDbs((id) => path.join(profiles.dir(id), "blombo.sqlite"));
  const cache = (...parts: string[]) => path.join(config.runtimeDir, "cache", ...parts);
  const gallery = new GalleryService({
    profiles,
    dbs,
    settings,
    runtimeDir: config.runtimeDir,
    publish: (topic, msg) => bus.publish(topic, msg),
    workflowExists: (id) =>
      workflows.get(id).then(
        () => true,
        () => false,
      ),
  });
  // The lookup fills in models without info files; it's created after the model service.
  let lookupRef: ModelLookup | null = null;
  const modelsChanged = () => {
    supervisor.refreshObjectInfo();
    bus.publish(null, { t: "models.changed" });
  };
  const models = new ModelService({
    profiles,
    runtimeDir: config.runtimeDir,
    onChanged: () => {
      modelsChanged();
      lookupRef?.start();
    },
    lookup: (profileId, id, size, mtime) => lookupRef?.infoFor(profileId, id, size, mtime) ?? null,
  });

  const civitaiApi = new CivitaiApi({
    baseUrl: config.civitaiUrl,
    cacheDir: cache("civitai", "api"),
  });
  const images = new ImageProxy({
    dir: cache("civitai", "images"),
    civitaiOrigin: civitaiApi.origin,
  });
  const civitai = new CivitaiService({ profiles, settings, models, dbs, api: civitaiApi, images });
  const lookup = new ModelLookup({
    profiles,
    settings,
    dbs,
    models,
    api: civitaiApi,
    allowedImage: civitai.allowedImage,
    site: civitai.site,
    publish: (topic, msg) => bus.publish(topic, msg),
    onFound: () => {
      models.invalidate();
      bus.publish(null, { t: "models.changed" });
    },
  });
  lookupRef = lookup;
  const catalog = new ManagerCatalog({
    url: config.catalogUrl,
    cacheDir: cache("manager"),
    profiles,
  });
  const downloads = new DownloadQueue({
    profiles,
    settings,
    dbs,
    models,
    civitai,
    catalog,
    lookup,
    publish: (topic, msg) => bus.publish(topic, msg),
    onFinished: () => {
      models.invalidate();
      modelsChanged();
    },
  });
  downloadQueue = downloads;
  settings.on("updated", (profileId, next, previous) => {
    if (profileId !== profiles.active) return;
    if (next.civitai.downloads.parallel !== previous.civitai.downloads.parallel)
      downloads.setParallel(next.civitai.downloads.parallel);
    if (next.civitai.lookup && !previous.civitai.lookup) lookup.start();
    if (!next.civitai.lookup && previous.civitai.lookup) lookup.stop();
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

  const layouts = new LayoutService({ presetsDir: config.presetsDir, profiles, settings });
  const stages = new StageService({
    presetsDir: config.presetsDir,
    profiles,
    workflows,
    supervisor,
    gallery,
  });
  const autocomplete = new AutocompleteService({
    presetsDir: config.presetsDir,
    profiles,
    settings,
    dbs,
    models,
  });

  queue = new JobQueue({
    supervisor,
    workflows,
    profiles,
    stages,
    recordPrompts: (texts) => autocomplete.record(texts),
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
      if (previousId !== profile.id) {
        await jobs.reset();
        lookup.stop();
      }
      models.invalidate();
      await gallery.open(profile.id);
      gallery.startSync();
      downloads.restore(profile.id);
      await supervisor.applyProfile(profile);
      bus.publish(null, { t: "profile.switched", profileId: profile.id });
      // Matching local models on Civitai waits a moment so the gallery sync goes first.
      setTimeout(() => {
        if (profiles.active === profile.id) lookup.start();
      }, 4000).unref();
    })().catch((error) => console.error("Opening the profile failed:", error));
  });
  profiles.on("updated", (profile) => {
    if (profile.id !== profiles.active) return;
    void supervisor.applyProfile(profile, "flag").catch((error) => console.error(error));
    models.invalidate();
    gallery.startSync();
    lookup.start();
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
    dbs,
    civitai,
    lookup,
    catalog,
    downloads,
    layouts,
    stages,
    autocomplete,
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
      downloads.shutdown();
      lookup.stop();
      await workflows.flush().catch(() => undefined);
      await gallery.close().catch(() => undefined);
      await supervisor.shutdown().catch(() => undefined);
      dbs.closeAll();
      bus.close();
    },
  };
}
