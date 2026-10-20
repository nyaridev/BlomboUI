/**
 * HTTP app: /api routes plus the built client in production. Routes stay thin; services
 * hold the logic. Errors become `{ error, code }` JSON with the right status.
 */
import fs from "node:fs";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { ApiErrorBody } from "../shared/api.ts";
import type { Services } from "./context.ts";
import { HttpError } from "./lib/http.ts";
import { autocompleteRoutes } from "./routes/autocomplete.ts";
import { batchRoutes } from "./routes/batch.ts";
import { bridgeAdminRoutes, bridgeRoutes } from "./routes/bridge.ts";
import { civitaiRoutes } from "./routes/civitai.ts";
import { comfyRoutes } from "./routes/comfy.ts";
import { downloadRoutes } from "./routes/downloads.ts";
import { fileInfoRoutes } from "./routes/fileinfo.ts";
import { galleryRoutes } from "./routes/gallery.ts";
import { jobRoutes } from "./routes/jobs.ts";
import { layoutRoutes } from "./routes/layouts.ts";
import { managerRoutes } from "./routes/manager.ts";
import { modelRoutes } from "./routes/models.ts";
import { profileRoutes } from "./routes/profiles.ts";
import { scriptRoutes } from "./routes/scripts.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { stageRoutes } from "./routes/stages.ts";
import { systemRoutes } from "./routes/system.ts";
import { wildcardRoutes } from "./routes/wildcards.ts";
import { workflowRoutes } from "./routes/workflows.ts";

export function createApp(services: Services) {
  const { config, profiles, supervisor, workflows, queue, settings, gallery, models } = services;
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof HttpError) {
      const body: ApiErrorBody = { error: error.message, code: error.code, details: error.details };
      return c.json(body, error.status);
    }
    console.error(error);
    const body: ApiErrorBody = { error: "Something went wrong on the server.", code: "internal" };
    return c.json(body, 500);
  });

  const api = new Hono();
  api.route("/system", systemRoutes(config, profiles));
  api.route("/profiles", profileRoutes(profiles, services.installPresets));
  api.route("/bridge", bridgeRoutes(services.bridge));
  api.route("/comfy/bridge", bridgeAdminRoutes(services.bridge));
  api.route(
    "/comfy",
    comfyRoutes(supervisor, services.installer, services.nodePacks, config.runtimeDir),
  );
  api.route(
    "/workflows",
    workflowRoutes(config, workflows, supervisor, services.layouts, services.bridge),
  );
  api.route("/scripts", scriptRoutes(services.scripts));
  api.route("/batch", batchRoutes(services.batch));
  api.route("/layouts", layoutRoutes(services.layouts, workflows));
  api.route("/stages", stageRoutes(services.stages));
  api.route("/autocomplete", autocompleteRoutes(services.autocomplete));
  api.route("/jobs", jobRoutes(queue, services.scripts));
  api.route("/wildcards", wildcardRoutes(profiles));
  api.route("/settings", settingsRoutes(profiles, settings));
  api.route("/gallery", galleryRoutes(gallery));
  api.route("/models", modelRoutes(models, services.lookup));
  api.route("/civitai", civitaiRoutes(services.civitai));
  api.route("/downloads", downloadRoutes(services.downloads));
  api.route("/manager", managerRoutes(services.catalog));
  api.route("/fileinfo", fileInfoRoutes(gallery, models));
  api.all("*", (c) => c.json({ error: "Unknown API route.", code: "not_found" }, 404));
  app.route("/api", api);

  if (fs.existsSync(config.clientDist)) {
    const root = path.relative(process.cwd(), config.clientDist);
    app.use(
      "/assets/*",
      serveStatic({
        root,
        onFound: (_p, c) => c.header("cache-control", "public, max-age=31536000, immutable"),
      }),
    );
    app.use("*", serveStatic({ root }));
    const index = fs.readFileSync(path.join(config.clientDist, "index.html"), "utf8");
    app.get("*", (c) => c.html(index));
  } else if (!config.dev) {
    app.get("*", (c) =>
      c.text("The web client is not built yet. Run `npm run build` or start-web.bat.", 503),
    );
  }

  return app;
}
