import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { type HttpError, readBody, readBodyToFile } from "./http.ts";

function app(max: number) {
  const a = new Hono();
  a.onError((e, c) => c.json({ code: (e as HttpError).code }, (e as HttpError).status ?? 500));
  a.post("/", async (c) => c.json({ size: (await readBody(c, max, "Too big.")).byteLength }));
  return a;
}

describe("readBody", () => {
  it("reads a body under the limit", async () => {
    const res = await app(10).request("/", { method: "POST", body: new Uint8Array(8) });
    expect(await res.json()).toEqual({ size: 8 });
  });

  it("refuses a body over the limit while it streams in", async () => {
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        sent += 4;
        if (sent > 4000) ctrl.close();
        else ctrl.enqueue(new Uint8Array(4));
      },
    });
    const res = await app(10).request("/", {
      method: "POST",
      body: stream,
      // @ts-expect-error Node's fetch needs this for a streamed body
      duplex: "half",
    });
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(100);
  });

  it("streams a body into a file, and stops at the limit", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-http-"));
    try {
      const a = new Hono();
      a.onError((e, c) => c.json({ code: (e as HttpError).code }, (e as HttpError).status ?? 500));
      a.post("/", async (c) => {
        const file = path.join(dir, "up.bin");
        return c.json({ size: await readBodyToFile(c, file, 10, "Too big.") });
      });
      const ok = await a.request("/", { method: "POST", body: new Uint8Array([1, 2, 3]) });
      expect(await ok.json()).toEqual({ size: 3 });
      expect([...(await fs.readFile(path.join(dir, "up.bin")))]).toEqual([1, 2, 3]);
      const big = await a.request("/", { method: "POST", body: new Uint8Array(20) });
      expect(big.status).toBe(413);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses by Content-Length before reading", async () => {
    const res = await app(10).request("/", {
      method: "POST",
      body: new Uint8Array(20),
      headers: { "content-length": "20" },
    });
    expect(res.status).toBe(413);
  });
});
