/**
 * Fetching from the internet on the user's behalf (Civitai, its image CDN, the model catalog,
 * model downloads). Redirects are followed by hand so that:
 *   - a credential (the Civitai API key) is sent only to the origin it belongs to, never to the
 *     storage host a download redirects to;
 *   - every hop can be checked against an allow-list (the image proxy only fetches Civitai's
 *     image hosts, so it can't be used to reach anything else).
 */

export interface FollowOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Sent only while the request URL is on this origin. */
  auth?: { origin: string; header: string };
  /** Refuse a hop (the first URL included) that this returns false for. */
  allow?: (url: URL) => boolean;
  maxHops?: number;
  /** Swap in a fake fetch (tests). */
  fetch?: typeof fetch;
}

export class RemoteError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
  }
}

export const USER_AGENT = "BlomboUI/2 (+local ComfyUI studio)";

/** GET `url`, following up to `maxHops` redirects; resolves with the final response. */
export async function fetchFollow(url: string, opts: FollowOptions = {}): Promise<Response> {
  const doFetch = opts.fetch ?? fetch;
  let current = new URL(url);
  for (let hop = 0; hop <= (opts.maxHops ?? 6); hop++) {
    if (current.protocol !== "https:" && current.protocol !== "http:")
      throw new RemoteError(`Refused to fetch a ${current.protocol} address.`, null);
    if (opts.allow && !opts.allow(current))
      throw new RemoteError(`Refused to fetch from ${current.host}.`, null);
    const headers: Record<string, string> = { "user-agent": USER_AGENT, ...opts.headers };
    if (opts.auth && current.origin === opts.auth.origin) headers.authorization = opts.auth.header;
    const res = await doFetch(current, { headers, signal: opts.signal, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel().catch(() => undefined);
      current = new URL(res.headers.get("location") as string, current);
      continue;
    }
    return res;
  }
  throw new RemoteError("Too many redirects.", null);
}

/** Read a response body up to `max` bytes (throws past it, so a huge file can't fill memory). */
export async function readLimited(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > max) {
    await res.body?.cancel().catch(() => undefined);
    throw new RemoteError("The file is larger than expected.", res.status);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (res.body)
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > max) throw new RemoteError("The file is larger than expected.", res.status);
      chunks.push(chunk);
    }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Image type from the first bytes, or null when it isn't an image we serve. */
export function sniffImage(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "image/webp";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8] ?? 0, b[9] ?? 0, b[10] ?? 0, b[11] ?? 0);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}
