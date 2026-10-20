import { describe, expect, it } from "vitest";
import { hostname, refusal } from "./guard.ts";

const base = { path: "/api/gallery/trash", host: "127.0.0.1:4380" };

describe("API guard", () => {
  it("reads the hostname from a Host header", () => {
    expect(hostname("127.0.0.1:4380")).toBe("127.0.0.1");
    expect(hostname("[::1]:4380")).toBe("[::1]");
    expect(hostname("LOCALHOST")).toBe("localhost");
  });

  it("lets its own pages and non-browser clients through", () => {
    expect(refusal({ ...base, origin: undefined, fetchSite: undefined })).toBeNull();
    expect(
      refusal({ ...base, origin: "http://127.0.0.1:4380", fetchSite: "same-origin" }),
    ).toBeNull();
    // Vite dev: the page and the proxied request share 127.0.0.1:4382.
    expect(
      refusal({
        ...base,
        host: "127.0.0.1:4382",
        origin: "http://127.0.0.1:4382",
        fetchSite: "same-origin",
      }),
    ).toBeNull();
    expect(
      refusal({ ...base, host: undefined, origin: undefined, fetchSite: undefined }),
    ).toBeNull();
  });

  it("refuses cross-site pages, other local ports and rebinding hosts", () => {
    expect(
      refusal({ ...base, origin: "https://evil.example", fetchSite: "cross-site" }),
    ).not.toBeNull();
    expect(
      refusal({ ...base, origin: "https://evil.example", fetchSite: undefined }),
    ).not.toBeNull();
    expect(
      refusal({ ...base, origin: "http://127.0.0.1:8188", fetchSite: "same-site" }),
    ).not.toBeNull();
    expect(refusal({ ...base, origin: "null", fetchSite: undefined })).not.toBeNull();
    expect(refusal({ ...base, origin: undefined, fetchSite: "cross-site" })).not.toBeNull();
    expect(
      refusal({
        ...base,
        host: "rebind.evil.example:4380",
        origin: undefined,
        fetchSite: undefined,
      }),
    ).not.toBeNull();
  });

  it("leaves the bridge routes to their own CORS check", () => {
    expect(
      refusal({
        path: "/api/bridge/session",
        host: "127.0.0.1:4380",
        origin: "http://127.0.0.1:8188",
        fetchSite: "same-site",
      }),
    ).toBeNull();
    // …but the bridge admin routes are Blombo's own.
    expect(
      refusal({
        path: "/api/comfy/bridge/install",
        host: "127.0.0.1:4380",
        origin: "http://127.0.0.1:8188",
        fetchSite: "same-site",
      }),
    ).not.toBeNull();
  });
});
