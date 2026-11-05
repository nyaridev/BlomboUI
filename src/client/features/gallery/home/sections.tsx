/**
 * Home's sections under the carousel: the newest images, the tags you prompt with, and the
 * models, LoRAs and wildcards you run, each a way into the image list (or Wildcards).
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useSession } from "@client/lib/session";
import { Button, Chip, Segmented } from "@client/ui";
import type { ModelKind } from "@shared/constants";
import type { GalleryHome, GalleryImage, HomeUse } from "@shared/gallery";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useModelThumb } from "../../models/thumbs";
import { Tile } from "../Grid";
import { useGalleryUi } from "../state";

const show = (patch: Parameters<ReturnType<typeof useGalleryUi.getState>["show"]>[0]) =>
  useGalleryUi.getState().show(patch);

/** A prompt tag as a search: tags are counted with underscores, prompts often use spaces. */
export const searchTag = (tag: string) => show({ q: tag.replace(/_/g, " ") });

export function SectionHead({
  title,
  icon,
  action,
}: {
  title: string;
  icon: IconName;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon name={icon} size={15} className="text-fg-3" />
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      <div className="ml-auto">{action}</div>
    </div>
  );
}

/** The newest images in one scrolling row. */
export function RecentStrip({
  images,
  onOpen,
  tall,
}: {
  images: GalleryImage[];
  onOpen: (id: number) => void;
  tall?: boolean;
}) {
  if (!images.length) return null;
  return (
    <section>
      <SectionHead
        title="Recent"
        icon="clock"
        action={
          <Button
            variant="ghost"
            size="sm"
            iconRight="arrow-right"
            onClick={() => show({ flat: true })}
          >
            See all
          </Button>
        }
      />
      <div className="scroll-quiet -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {images.map((im) => (
          <div
            key={im.id}
            className={cn("shrink-0", tall ? "h-56" : "h-40")}
            style={{ aspectRatio: `${Math.max(im.width, 1)} / ${Math.max(im.height, 1)}` }}
          >
            <Tile image={im} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** The tags you prompt with: lately (the last two weeks) or ever. */
export function TagsPanel({ tags }: { tags: GalleryHome["tags"] }) {
  const [when, setWhen] = useState<"lately" | "top">(tags.lately.length ? "lately" : "top");
  const list = tags[when];
  return (
    <section>
      <SectionHead
        title="Tags you use"
        icon="tag"
        action={
          <Segmented
            size="sm"
            label="Tags from"
            value={when}
            onChange={setWhen}
            options={[
              { value: "lately", label: "Lately" },
              { value: "top", label: "All time" },
            ]}
          />
        }
      />
      {list.length ? (
        <div className="flex flex-wrap gap-1.5">
          {list.map((t) => (
            <Chip key={t.tag} size="sm" count={t.uses} onClick={() => searchTag(t.tag)}>
              {t.tag.replace(/_/g, " ")}
            </Chip>
          ))}
        </div>
      ) : (
        <Hint>
          {when === "lately"
            ? "Nothing in the last two weeks. Tags you prompt with show up here."
            : "Tags you prompt with show up here once you've used them a few times."}
        </Hint>
      )}
    </section>
  );
}

const KIND: Record<"models" | "loras", ModelKind> = { models: "checkpoints", loras: "loras" };

const label = (name: string) =>
  name
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, "") ?? name;

function useOpenUse(what: "models" | "loras" | "wildcards") {
  const navigate = useNavigate();
  const profileId = useSession((s) => s.profileId);
  return (u: HomeUse) => {
    if (what === "wildcards") {
      if (profileId)
        void navigate({ to: "/p/$profileId/$view", params: { profileId, view: "wildcards" } });
    } else if (u.filter) show(what === "models" ? { model: u.filter } : { lora: u.filter });
  };
}

/** Models or LoRAs as picture cards: your newest image with it, or its own picture. */
export function UseCards({ what, uses }: { what: "models" | "loras"; uses: HomeUse[] }) {
  const open = useOpenUse(what);
  const title = what === "models" ? "Models you use" : "LoRAs you use";
  return (
    <section>
      <SectionHead title={title} icon={what === "models" ? "models" : "layers"} />
      {uses.length ? (
        <div className="scroll-quiet -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {uses.map((u) => (
            <UseCard key={u.name} what={what} use={u} onOpen={() => open(u)} />
          ))}
        </div>
      ) : (
        <Hint>{`The ${what === "models" ? "models" : "LoRAs"} you generate with show up here.`}</Hint>
      )}
    </section>
  );
}

function UseCard({
  what,
  use,
  onOpen,
}: {
  what: "models" | "loras";
  use: HomeUse;
  onOpen: () => void;
}) {
  const thumb = useModelThumb(KIND[what], use.name);
  const picture = use.cover ?? thumb;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!use.filter}
      title={
        use.filter ? `Show images made with ${label(use.name)}` : "No images with it in the gallery"
      }
      className="group relative aspect-[3/4] w-[150px] shrink-0 overflow-hidden rounded-lg border border-line bg-sunken text-left transition-colors hover:border-accent/70 focus-ring disabled:hover:border-line"
    >
      {picture ? (
        <img
          src={picture}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-fg-4">
          <Icon name={what === "models" ? "models" : "layers"} size={28} strokeWidth={1.25} />
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/85 via-black/40 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-2.5">
        <span className="line-clamp-2 text-xs font-medium break-words text-white">
          {label(use.name)}
        </span>
        <Counts use={use} className="text-white/70" />
      </span>
    </button>
  );
}

/** Models, LoRAs or wildcards as a ranked list with a bar for how often. */
export function UseList({
  what,
  uses,
}: {
  what: "models" | "loras" | "wildcards";
  uses: HomeUse[];
}) {
  const open = useOpenUse(what);
  const max = Math.max(1, ...uses.map((u) => u.count));
  const icon: IconName = what === "models" ? "models" : what === "loras" ? "layers" : "wildcards";
  const title = what === "models" ? "Models" : what === "loras" ? "LoRAs" : "Wildcards";
  return (
    <section className="min-w-0">
      <SectionHead title={title} icon={icon} />
      {uses.length ? (
        <ol className="flex flex-col gap-0.5">
          {uses.map((u) => (
            <li key={u.name}>
              <UseRow what={what} use={u} max={max} onOpen={() => open(u)} />
            </li>
          ))}
        </ol>
      ) : (
        <Hint>{`The ${what === "loras" ? "LoRAs" : what} you run show up here.`}</Hint>
      )}
    </section>
  );
}

function UseRow({
  what,
  use,
  max,
  onOpen,
}: {
  what: "models" | "loras" | "wildcards";
  use: HomeUse;
  max: number;
  onOpen: () => void;
}) {
  const thumb = useModelThumb(
    what === "wildcards" ? "loras" : KIND[what],
    what === "wildcards" ? "" : use.name,
  );
  const picture = use.cover ?? thumb;
  const clickable = what === "wildcards" || Boolean(use.filter);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!clickable}
      className="group flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-field focus-ring disabled:hover:bg-transparent"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-sm bg-sunken text-fg-4">
        {picture ? (
          <img src={picture} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Icon
            name={what === "models" ? "models" : what === "loras" ? "layers" : "wildcards"}
            size={15}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm text-fg-2 group-hover:text-fg">
          {what === "wildcards" ? `__${use.name}__` : label(use.name)}
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-sunken">
          <span
            className="block h-full rounded-full bg-accent/70"
            style={{ width: `${Math.max(6, (use.count / max) * 100)}%` }}
          />
        </span>
      </span>
      <Counts use={use} className="shrink-0 text-fg-3" />
    </button>
  );
}

function Counts({ use, className }: { use: HomeUse; className?: string }) {
  return (
    <span className={cn("font-mono text-2xs tabular", className)}>
      {use.count.toLocaleString()} {use.count === 1 ? "run" : "runs"}
      {use.recent && use.recent < use.count ? ` · ${use.recent.toLocaleString()} lately` : ""}
    </span>
  );
}

/** Wildcards as chips (for layouts that keep them small). */
export function WildcardChips({ uses }: { uses: HomeUse[] }) {
  const open = useOpenUse("wildcards");
  return (
    <section>
      <SectionHead title="Wildcards" icon="wildcards" />
      {uses.length ? (
        <div className="flex flex-wrap gap-1.5">
          {uses.map((u) => (
            <Chip key={u.name} size="sm" count={u.count} onClick={() => open(u)}>
              <span className="font-mono">{`__${u.name}__`}</span>
            </Chip>
          ))}
        </div>
      ) : (
        <Hint>The wildcards you prompt with show up here.</Hint>
      )}
    </section>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-fg-3">{children}</p>;
}
