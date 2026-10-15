import { describe, expect, it } from "vitest";
import { decodePreviewFrame, encodePreviewFrame, ServerMessage } from "./live.ts";

describe("preview frames", () => {
  it("round-trips the job seq, type and bytes", () => {
    const image = new Uint8Array([0xff, 0xd8, 1, 2, 3]);
    const frame = encodePreviewFrame(70_000, 1, image);
    const decoded = decodePreviewFrame(frame.buffer as ArrayBuffer);
    expect(decoded?.jobSeq).toBe(70_000);
    expect(decoded?.mime).toBe("image/jpeg");
    expect([...(decoded?.image ?? [])]).toEqual([...image]);
  });

  it("rejects frames that are too short or of unknown kind", () => {
    expect(decodePreviewFrame(new Uint8Array([0, 0, 0, 1, 1]))).toBeNull();
    expect(decodePreviewFrame(new Uint8Array([0, 0, 0, 1, 9, 1]))).toBeNull();
  });
});

describe("ServerMessage", () => {
  it("accepts a progress message and rejects unknown types", () => {
    const ok = ServerMessage.safeParse({
      t: "job.progress",
      jobId: "j1",
      seq: 1,
      progress: { value: 3, max: 20, node: "5", overall: 0.15 },
    });
    expect(ok.success).toBe(true);
    expect(ServerMessage.safeParse({ t: "nope" }).success).toBe(false);
  });
});
