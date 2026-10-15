/**
 * Models: Local · Civitai · Manager. One ModelCard everywhere. Local runs on the profile's
 * models folder (LocalModels.tsx). Civitai and Manager are still previews of the planned
 * browser and store (Phase 3) and use sample data.
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { formatBytes } from "@client/lib/number";
import { useLocalModels } from "@client/lib/queries";
import { Badge, Button, Chip, IconButton, ModelCard, Select, Tabs, TextField } from "@client/ui";
import { useState } from "react";
import { LocalModels } from "./LocalModels";

type Sub = "local" | "civitai" | "manager";

export function ModelsView() {
  const [sub, setSub] = useState<Sub>("local");
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-line px-5 pt-2">
        <Tabs
          variant="line"
          value={sub}
          onChange={setSub}
          label="Models"
          items={[
            { value: "local", label: "Local", icon: "folder" },
            { value: "civitai", label: "Civitai", icon: "globe" },
            { value: "manager", label: "Manager", icon: "store" },
          ]}
          className="border-b-0"
        />
        <FolderSummary />
      </div>
      {sub === "local" ? <LocalModels /> : sub === "civitai" ? <Civitai /> : <Manager />}
    </div>
  );
}

/** "B:\Models · 1,284 files · 412 GB" for the open profile. */
function FolderSummary() {
  const list = useLocalModels().data;
  if (!list?.root) return null;
  return (
    <span className="ml-auto truncate pb-1.5 font-mono text-xs text-fg-3" title={list.root}>
      {list.root} · {list.models.length.toLocaleString()} files · {formatBytes(list.totalSize)}
    </span>
  );
}

function Civitai() {
  const [query, setQuery] = useState("illustrious lighting");
  const [open, setOpen] = useState<string[]>(["Cinematic Lighting", "Ghibli Background Style"]);
  const results = [
    "Cinematic Lighting",
    "Neon Rim Light",
    "Soft Window Light",
    "God Rays XL",
    "Volumetric Fog",
    "Golden Hour IL",
    "Backlight Silhouette",
    "Studio Softbox",
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-line bg-surface px-5 py-1.5">
        <Chip size="sm" icon="search" selected>
          Browse
        </Chip>
        {open.map((t) => (
          <Chip
            key={t}
            size="sm"
            icon="layers"
            onRemove={() => setOpen(open.filter((x) => x !== t))}
          >
            {t}
          </Chip>
        ))}
      </div>
      <div className="flex flex-col gap-2.5 px-5 pt-4">
        <div className="flex gap-2">
          <TextField
            size="lg"
            icon="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            className="flex-1"
            placeholder="Search Civitai"
          />
          <Button size="lg" variant="primary">
            Search
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            size="sm"
            value="LORA"
            onChange={() => undefined}
            className="w-[120px]"
            options={[
              { value: "LORA", label: "LoRA" },
              { value: "Checkpoint", label: "Checkpoint" },
            ]}
          />
          <Select
            size="sm"
            value="il"
            onChange={() => undefined}
            className="w-[150px]"
            options={[
              { value: "il", label: "Illustrious" },
              { value: "sdxl", label: "SDXL 1.0" },
            ]}
          />
          <Select
            size="sm"
            value="rated"
            onChange={() => undefined}
            className="w-[150px]"
            options={[
              { value: "rated", label: "Highest rated" },
              { value: "dl", label: "Most downloaded" },
            ]}
          />
          <Select
            size="sm"
            value="month"
            onChange={() => undefined}
            className="w-[110px]"
            options={[
              { value: "month", label: "Month" },
              { value: "all", label: "All time" },
            ]}
          />
          <span className="mx-1 h-5 w-px bg-line" />
          <span className="text-xs text-fg-3">Recent:</span>
          {["detail slider", "ghibli", "pixel art"].map((h) => (
            <Chip key={h} size="sm" icon="history" onClick={() => setQuery(h)}>
              {h}
            </Chip>
          ))}
        </div>
      </div>
      <div className="scroll-quiet grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 overflow-y-auto p-5">
        {results.map((r, i) => (
          <ModelCard
            key={r}
            name={r}
            kind="loras"
            baseModel="IL"
            thumb={i % 3 === 2 ? null : `art:civ-${r}`}
            onClick={() => setOpen(open.includes(r) ? open : [...open, r])}
            footer={
              <div className="flex items-center gap-3 text-2xs text-fg-3">
                <span className="flex items-center gap-1">
                  <Icon name="download" size={11} />
                  {(12.4 - i).toFixed(1)}k
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="heart" size={11} />
                  {(2.1 + i * 0.3).toFixed(1)}k
                </span>
                {i === 0 ? (
                  <Badge tone="success" className="ml-auto">
                    Installed
                  </Badge>
                ) : null}
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

const STORE = [
  {
    cat: "Upscalers",
    items: [
      ["4x-UltraSharp", "64 MB", true],
      ["4x_NMKD-Siax_200k", "64 MB", false],
      ["RealESRGAN x4plus anime", "17 MB", false],
    ],
  },
  {
    cat: "Detectors",
    items: [
      ["face_yolov8m", "52 MB", true],
      ["hand_yolov8s", "22 MB", false],
      ["person_yolov8m-seg", "54 MB", false],
    ],
  },
  {
    cat: "SAM",
    items: [
      ["sam_vit_b_01ec64", "375 MB", true],
      ["sam_vit_l_0b3195", "1.2 GB", false],
    ],
  },
  {
    cat: "ControlNet",
    items: [
      ["controlnet-openpose-sdxl", "2.5 GB", true],
      ["controlnet-canny-sdxl", "2.5 GB", false],
      ["xinsir union promax", "2.5 GB", false],
    ],
  },
] as const;

function Manager() {
  const [cat, setCat] = useState("all");
  const [installing, setInstalling] = useState<string | null>(null);
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[220px] shrink-0 flex-col gap-0.5 border-r border-line p-3">
        <TextField size="sm" icon="search" placeholder="Search catalog" className="mb-2" />
        {["all", ...STORE.map((s) => s.cat)].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={cn(
              "flex h-8 items-center justify-between rounded-md px-2.5 text-sm focus-ring",
              cat === c ? "bg-field text-fg" : "text-fg-2 hover:bg-field/60",
            )}
          >
            {c === "all" ? "Everything" : c}
            <span className="font-mono text-2xs text-fg-3">
              {c === "all" ? 11 : STORE.find((s) => s.cat === c)?.items.length}
            </span>
          </button>
        ))}
      </aside>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-5">
        {STORE.filter((s) => cat === "all" || s.cat === cat).map((s) => (
          <section key={s.cat} className="mb-6">
            <h3 className="label-caps mb-2">{s.cat}</h3>
            <div className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {s.items.map(([name, size, installed]) => (
                <div key={name} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-field text-fg-2">
                    <Icon
                      name={
                        s.cat === "Upscalers"
                          ? "upscale"
                          : s.cat === "ControlNet"
                            ? "pose"
                            : "face-scan"
                      }
                      size={17}
                    />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-fg">{name}</span>
                    <span className="text-2xs text-fg-3">
                      {size} · comfyui/models/{s.cat.toLowerCase()}
                    </span>
                  </div>
                  {installed ? (
                    <Badge tone="success">
                      <Icon name="check" size={11} /> Installed
                    </Badge>
                  ) : installing === name ? (
                    <div className="flex w-36 items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-field">
                        <div className="h-full w-2/3 animate-pulse rounded-full bg-accent" />
                      </div>
                      <IconButton
                        icon="x"
                        label="Cancel"
                        size="xs"
                        onClick={() => setInstalling(null)}
                      />
                    </div>
                  ) : (
                    <Button size="sm" icon="download" onClick={() => setInstalling(name)}>
                      Install
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
