// blombo-bridge core: talking to BlomboUI from ComfyUI's page, without touching the page.
// blombo.js (the ComfyUI extension) uses it; Blombo's tests import it directly. Plain ES module,
// no dependencies, because ComfyUI loads it as is. ComfyUI also imports every .js in this folder
// as an extension; this module only exports functions, so that's harmless.

/** The edit session in ComfyUI's address (?blombo=<token>&blombo_api=<origin>), or null. */
export function readParams(search) {
  const q = new URLSearchParams(search || "");
  const token = q.get("blombo");
  const api = q.get("blombo_api");
  if (!token || !/^[A-Za-z0-9_-]{16,}$/.test(token)) return null;
  return { token, api: api && /^https?:\/\/[^/?#]+$/.test(api) ? api : null };
}

/** The address without the session parameters, so a reload doesn't reuse a spent token. */
export function cleanUrl(href) {
  const url = new URL(href);
  url.searchParams.delete("blombo");
  url.searchParams.delete("blombo_api");
  return url.toString();
}

/** Blombo's address written next to this file when Blombo installed it (config.json). */
export async function configuredApi(fetchFn, baseUrl) {
  try {
    const res = await fetchFn(new URL("config.json", baseUrl).toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body.api === "string" && /^https?:\/\/[^/?#]+$/.test(body.api) ? body.api : null;
  } catch {
    return null;
  }
}

/**
 * Which Blombo to talk to. The address bar may name one (Blombo puts it there when it opens
 * ComfyUI), but only an address on this computer is believed: a link from anywhere else could
 * otherwise send the canvas to another site on "Save to Blombo". Then config.json's.
 */
export function pickApi(fromUrl, configured) {
  if (fromUrl) {
    try {
      const host = new URL(fromUrl).hostname;
      if (host === "127.0.0.1" || host === "localhost" || host === "[::1]") return fromUrl;
    } catch {
      // not an address
    }
  }
  return configured || null;
}

/** Requests to Blombo's /api/bridge. Errors carry Blombo's own message. */
export function createClient(api, fetchFn) {
  const call = async (method, path, body) => {
    let res;
    try {
      res = await fetchFn(`${api}/api/bridge${path}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error(`Can't reach BlomboUI at ${api}. Is it still running?`);
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || `BlomboUI answered ${res.status}.`);
    return data;
  };
  return {
    session: (token) => call("GET", `/session/${encodeURIComponent(token)}`),
    save: (token, graphs, mode) =>
      call("POST", `/session/${encodeURIComponent(token)}/save`, { ...graphs, mode }),
    cancel: (token) => call("POST", `/session/${encodeURIComponent(token)}/cancel`, {}),
    send: (graphs, name) => call("POST", "/import", name ? { ...graphs, name } : graphs),
  };
}

/** What app.graphToPrompt() gives, in the shape Blombo takes. */
export function toGraphs(result) {
  if (!result || typeof result !== "object" || !result.output || !result.workflow)
    throw new Error("ComfyUI couldn't turn the canvas into a workflow.");
  return { workflow: result.workflow, output: result.output };
}
