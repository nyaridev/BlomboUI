/**
 * HTTP app: /api routes plus the built client in production. Routes stay thin; services
 * hold the logic. Errors become `{ error, code }` JSON with the right status.
 */
import fs from "node:fs";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { ApiErrorBody } from "../shared/api.ts";
import type { ServerConfig } from "./config.ts";
import { HttpError } from "./lib/http.ts";
import { profileRoutes } from "./routes/profiles.ts";
import { systemRoutes } from "./routes/system.ts";
import type { ProfileService } from "./services/profiles.ts";

export interface AppDeps {
  config: ServerConfig;
  profiles: ProfileService;
}

export function createApp({ config, profiles }: AppDeps) {
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
  api.route("/profiles", profileRoutes(profiles));
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
