import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { type HttpError, readBody } from "./http.ts";

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

  it("refuses by Content-Length before reading", async () => {
    const res = await app(10).request("/", {
      method: "POST",
      body: new Uint8Array(20),
      headers: { "content-length": "20" },
    });
    expect(res.status).toBe(413);
  });
});
