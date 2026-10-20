/**
 * /api/bridge: what the blombo-bridge extension calls from ComfyUI's page (ADR-0009). These
 * routes are cross-origin by design, so they answer CORS for exactly one origin: the ComfyUI the
 * open profile uses. A browser request from any other origin is refused before it reaches a
 * route; requests without an Origin (not from a browser page) go through as usual.
 */
import { Hono } from "hono";
import { BridgeImportBody, BridgeSaveBody, InstallBridgeBody } from "../../shared/bridge.ts";
import { HttpError, readJson } from "../lib/http.ts";
import type { BridgeService } from "../services/bridge.ts";

export function bridgeRoutes(bridge: BridgeService) {
  const r = new Hono();

  r.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin) {
      if (!bridge.allowedOrigins().includes(origin))
        throw new HttpError(
          403,
          "Only the ComfyUI this Blombo profile uses can talk to the bridge.",
          "bad_origin",
        );
      c.header("access-control-allow-origin", origin);
      c.header("vary", "Origin");
    }
    if (c.req.method === "OPTIONS") {
      c.header("access-control-allow-methods", "GET, POST, OPTIONS");
      c.header("access-control-allow-headers", "content-type");
      c.header("access-control-max-age", "600");
      return c.body(null, 204);
    }
    await next();
  });

  r.get("/session/:token", async (c) => c.json(await bridge.session(c.req.param("token"))));

  r.post("/session/:token/save", async (c) => {
    const body = await readJson(c, BridgeSaveBody);
    return c.json(await bridge.save(c.req.param("token"), body));
  });

  r.post("/session/:token/cancel", (c) => {
    bridge.cancel(c.req.param("token"));
    return c.body(null, 204);
  });

  r.post("/import", async (c) => {
    const body = await readJson(c, BridgeImportBody);
    return c.json(await bridge.importCanvas(body), 201);
  });

  return r;
}

/** /api/comfy/bridge: Blombo's own page asks whether the bridge is loaded, or installs it. */
export function bridgeAdminRoutes(bridge: BridgeService) {
  const r = new Hono();
  r.get("/", async (c) => c.json(await bridge.status()));
  r.post("/install", async (c) => {
    const body = await readJson(c, InstallBridgeBody);
    return c.json(await bridge.installInto(body.folder));
  });
  return r;
}
