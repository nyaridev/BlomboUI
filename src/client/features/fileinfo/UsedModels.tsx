/**
 * The checkpoint and LoRAs an image was made with, each matched to a model in your models folder
 * by file name (which knows its Civitai page from its info file or the background lookup) or, for
 * a model you don't have, found on Civitai by the hash A1111 wrote for it.
 */
import { Icon } from "@client/icons/Icon";
import { useGoToView } from "@client/lib/hooks";
import { useCivitaiByHash, useLocalModels } from "@client/lib/queries";
import { Badge, Button, KIND_STYLE, Panel } from "@client/ui";
import type { ImageFileInfo } from "@shared/fileinfo";
import { modelKey, type UsedModel, usedModels } from "@shared/imageinfo";
import type { LocalModel } from "@shared/models";
import { useMemo } from "react";
import { openCivitaiModel } from "../models/civitai/state";
import { useModelsNav } from "../models/nav";
import { versionOf } from "./CivitaiMatch";

export function UsedModels({ image }: { image: ImageFileInfo }) {
  const used = useMemo(
    () => usedModels(image.summary, image.a1111?.settings),
    [image.summary, image.a1111],
  );
  const local = useLocalModels(used.length > 0).data?.models;
  const byKey = useMemo(() => {
    const map = new Map<string, LocalModel[]>();
    for (const m of local ?? []) {
      const key = modelKey(m.file);
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return map;
  }, [local]);
  if (!used.length) return null;

  const find = (u: UsedModel) => {
    const same = byKey.get(modelKey(u.name)) ?? [];
    const kinds: LocalModel["kind"][] =
      u.kind === "lora" ? ["loras"] : ["checkpoints", "diffusion_models"];
    return same.find((m) => kinds.includes(m.kind)) ?? same[0] ?? null;
  };

  return (
    <Panel className="flex flex-col p-5 pb-2">
      <span className="label-caps">Models used</span>
      <div className="flex flex-col divide-y divide-line">
        {used.map((u) => (
          <Row key={`${u.kind}:${u.name}`} used={u} local={find(u)} />
        ))}
      </div>
    </Panel>
  );
}

function Row({ used, local }: { used: UsedModel; local: LocalModel | null }) {
  const goTo = useGoToView();
  const known = local?.civitai ?? null;
  const q = useCivitaiByHash(!known && used.hash ? used.hash : null);
  const hit = q.data ?? null;
  const version = hit ? versionOf(hit) : null;
  const modelId = known?.modelId ?? hit?.model.id ?? null;
  const name = local?.name ?? hit?.model.name ?? used.name;
  const style = KIND_STYLE[used.kind === "lora" ? "loras" : "checkpoints"];
  const details = [
    style.label,
    name !== used.name ? used.name : null,
    version?.name ?? null,
    local?.baseModel ?? version?.baseModel ?? null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 py-3 max-lg:flex-wrap">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-2 text-fg-3">
        <Icon name={style.icon} size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">{name}</span>
          {used.strength !== null ? (
            <Badge>
              <span className="tabular">{used.strength}</span>
            </Badge>
          ) : null}
        </div>
        <span className="truncate text-xs text-fg-3">
          {details.join(" · ")}
          {used.hash ? <span className="ml-2 font-mono">{used.hash}</span> : null}
        </span>
      </div>
      {local ? (
        <Badge tone="success">
          <Icon name="check" size={11} /> In your models folder
        </Badge>
      ) : q.isLoading ? (
        <Badge>
          <Icon name="refresh" size={11} className="animate-spin" /> Searching Civitai
        </Badge>
      ) : (
        <Badge tone="warning">
          <Icon name="info" size={11} />
          {used.hash && !hit ? "Not in your folder or on Civitai" : "Not in your models folder"}
        </Badge>
      )}
      <span className="flex shrink-0 gap-1.5">
        {local ? (
          <Button
            size="sm"
            variant="ghost"
            icon="models"
            onClick={() => {
              useModelsNav.getState().showLocal(local.id);
              goTo("models");
            }}
          >
            Show
          </Button>
        ) : null}
        {modelId ? (
          <Button
            size="sm"
            icon="globe"
            onClick={() => {
              openCivitaiModel(modelId, name);
              goTo("models");
            }}
          >
            Civitai page
          </Button>
        ) : null}
      </span>
    </div>
  );
}
