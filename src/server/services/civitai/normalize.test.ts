import { describe, expect, it } from "vitest";
import { fromBase64Url } from "../../../shared/civitai.ts";
import { card, type NormalizeContext } from "./normalize.ts";

const ctx: NormalizeContext = {
  allowed: () => true,
  site: "https://civitai.com",
  local: () => null,
};
const img = (name: string) => ({ url: `https://image.civitai.com/a/${name}.jpeg` });

describe("card", () => {
  const model = {
    id: 1,
    name: "Mixed",
    type: "LORA",
    modelVersions: [
      { id: 30, baseModel: "Anima", images: [img("anima")] },
      { id: 20, baseModel: "Illustrious", images: [img("ill")] },
      { id: 10, baseModel: "Illustrious", images: [img("old")] },
    ],
  };

  it("shows the newest version, or the newest on the filter's base models", () => {
    expect(card(model, ctx)).toMatchObject({ versionId: 30, baseModel: "Anima" });
    const ill = card(model, ctx, ["Illustrious"]);
    expect(ill).toMatchObject({ versionId: 20, baseModel: "Illustrious" });
    const thumb = new URL(ill.image?.thumb ?? "", "http://x").searchParams.get("u") ?? "";
    expect(fromBase64Url(thumb)).toContain("/ill.jpeg");
    expect(card(model, ctx, ["Pony"])).toMatchObject({ versionId: 30 });
  });
});
