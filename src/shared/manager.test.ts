import { describe, expect, it } from "vitest";
import { catalogFolder, kindOfFolder, storeCategory } from "./manager.ts";

describe("model catalog", () => {
  it("places entries in model folders", () => {
    expect(catalogFolder("upscale", "default")).toBe("upscale_models");
    expect(catalogFolder("Ultralytics", "ultralytics/bbox")).toBe("ultralytics/bbox");
    expect(catalogFolder("lora", "custom_nodes/x/models")).toBeNull();
    expect(catalogFolder("lora", "../escape")).toBeNull();
    expect(catalogFolder("weird", "default")).toBeNull();
  });

  it("groups types into store categories and kinds", () => {
    expect(storeCategory("Ultralytics")).toBe("detectors");
    expect(storeCategory("IP-Adapter")).toBe("ip-adapter");
    expect(storeCategory("deepbump")).toBe("other");
    expect(kindOfFolder("ultralytics/segm")).toBe("ultralytics");
    expect(kindOfFolder("unet")).toBe("diffusion_models");
    expect(kindOfFolder("clip_vision")).toBeNull();
  });
});
