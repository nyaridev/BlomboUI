import type { Download } from "@shared/downloads";
import { describe, expect, it } from "vitest";
import { cardMark } from "./marks";

const dl = (patch: Partial<Download>): Download => ({
  id: "d",
  source: "civitai",
  name: "x",
  dest: "loras/x.safetensors",
  kind: "loras",
  size: 1,
  received: 0,
  state: "done",
  error: null,
  createdAt: 0,
  startedAt: null,
  finishedAt: null,
  modelId: 1,
  versionId: 11,
  entryId: null,
  thumb: null,
  ...patch,
});

describe("cardMark", () => {
  const card = { id: 1, versionId: 12, local: null };

  it("shows downloads first, then installed or update", () => {
    expect(cardMark(card, [dl({ state: "running" })], true)?.label).toBe("Downloading");
    expect(cardMark(card, [dl({ versionId: 12 })], true)?.label).toBe("Installed");
    expect(cardMark(card, [dl({ versionId: 11 })], true)?.label).toBe("Update");
    expect(cardMark({ ...card, local: { versions: [12], latest: true } }, [], true)?.label).toBe(
      "Installed",
    );
    expect(cardMark(card, [], true)).toBeNull();
  });

  it("hides installed marks when they're turned off", () => {
    expect(cardMark({ ...card, local: { versions: [12], latest: true } }, [], false)).toBeNull();
    expect(cardMark(card, [dl({ state: "queued" })], false)?.label).toBe("Downloading");
  });
});
