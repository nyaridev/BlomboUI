/**
 * Test setup for the online features: the real service wiring (context.ts) on throwaway data,
 * runtime and models folders, pointed at a fake Civitai and catalog. Never the real site.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ServerMessage } from "../../../../shared/live.ts";
import { createConfig, parseFlags } from "../../../config.ts";
import { createServices, type Services } from "../../../context.ts";
import { type FakeCivitai, type FakeCivitaiOptions, startFakeCivitai } from "./fake-civitai.ts";

export interface Online {
  fake: FakeCivitai;
  services: Services;
  tmp: string;
  models: string;
  profileId: string;
  messages: ServerMessage[];
  close: () => Promise<void>;
}

export async function setupOnline(opts: FakeCivitaiOptions = {}): Promise<Online> {
  const fake = await startFakeCivitai(opts);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "blombo-online-"));
  const config = createConfig(
    parseFlags([
      "--data",
      path.join(tmp, "data"),
      "--runtime",
      path.join(tmp, "runtime"),
      "--civitai",
      fake.url,
      "--catalog",
      `${fake.url}/catalog/model-list.json`,
    ]),
  );
  const services = createServices(config);
  const messages: ServerMessage[] = [];
  const publish = services.bus.publish.bind(services.bus);
  services.bus.publish = (topic, msg) => {
    messages.push(msg);
    publish(topic, msg);
  };
  const models = path.join(tmp, "models");
  await fs.mkdir(path.join(models, "loras"), { recursive: true });
  await fs.mkdir(path.join(models, "checkpoints"), { recursive: true });
  const profile = await services.profiles.create({
    name: "Online test",
    accent: "blue",
    theme: "blombo",
    paths: { models, outputs: path.join(tmp, "outputs"), wildcards: "" },
    comfy: { mode: "external", url: "http://127.0.0.1:9" },
    presets: [],
  });
  await services.profiles.open(profile.id);
  return {
    fake,
    services,
    tmp,
    models,
    profileId: profile.id,
    messages,
    close: async () => {
      await services.shutdown();
      await fake.close();
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

/** Wait until `check` returns something truthy (polling a local condition in a test). */
export async function waitFor<T>(check: () => T | Promise<T>, ms = 5000): Promise<NonNullable<T>> {
  const until = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value as NonNullable<T>;
    if (Date.now() > until) throw new Error("Timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
}
