/**
 * Only Blombo's own pages may use the API. Browsers let any site send "simple" requests to
 * 127.0.0.1 (a POST with a text/plain body needs no preflight, and Hono parses it as JSON), and a
 * rebinding hostname that resolves to 127.0.0.1 can even read the answers. So, before any route:
 *
 *  - the Host header must name this machine (DNS rebinding);
 *  - a browser request must come from the same origin: its Origin, when sent, must be this
 *    server's own address, and Sec-Fetch-Site, when sent, must say same-origin or none. Other
 *    local pages (ComfyUI and its custom nodes on another port) are refused too.
 *
 * Requests without those headers (scripts, tests) aren't from a web page and go through. The
 * bridge routes (`/api/bridge/*`) are cross-origin by design and check their own origin.
 */
import type { MiddlewareHandler } from "hono";

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]", "tauri.localhost"]);

/** The hostname part of a Host header ("127.0.0.1:4380" → "127.0.0.1", "[::1]:80" → "[::1]"). */
export function hostname(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  const colon = h.indexOf(":");
  return colon >= 0 ? h.slice(0, colon) : h;
}

export interface RequestFacts {
  path: string;
  host: string | undefined;
  origin: string | undefined;
  fetchSite: string | undefined;
}

/** An Origin header ("null" for sandboxed pages and files) names this server's own address. */
function sameOrigin(origin: string, host: string | undefined): boolean {
  if (host === undefined) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.trim().toLowerCase();
  } catch {
    return false;
  }
}

/** Why a request is refused, or null when it may go on. */
export function refusal(r: RequestFacts): string | null {
  if (r.host !== undefined && !LOCAL_HOSTNAMES.has(hostname(r.host)))
    return "BlomboUI only answers requests addressed to this computer (127.0.0.1 or localhost).";
  if (r.path.startsWith("/api/bridge/") || r.path === "/api/bridge") return null;
  if (r.fetchSite !== undefined && r.fetchSite !== "same-origin" && r.fetchSite !== "none")
    return "BlomboUI's API only answers its own pages.";
  if (r.origin !== undefined && !sameOrigin(r.origin, r.host))
    return "BlomboUI's API only answers its own pages.";
  return null;
}

export const localOnly: MiddlewareHandler = async (c, next) => {
  const why = refusal({
    path: c.req.path,
    host: c.req.header("host"),
    origin: c.req.header("origin"),
    fetchSite: c.req.header("sec-fetch-site"),
  });
  if (why) return c.json({ error: why, code: "forbidden_origin" }, 403);
  await next();
};
