/**
 * The models, LoRAs and wildcards you run and the tags you prompt with, as picture cards that
 * crossfade through their newest images: rows on Home, grids in the Most used views. A model or
 * LoRA filters the image list, a tag searches it, a wildcard opens Wildcards.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useSession } from "@client/lib/session";
import { Button, Segmented } from "@client/ui";
import type { GalleryHome, HomeUse, UseKind } from "@shared/gallery";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { useModelThumb } from "../../models/thumbs";
import { useGalleryUi } from "../state";

export const USE_ICON: Record<UseKind, IconName> = {
  models: "models",
  loras: "layers",
  wildcards: "wildcards",
  tags: "tag",
};

export const USE_LABEL: Record<UseKind, string> = {
  models: "Models",
  loras: "LoRAs",
  wildcards: "Wildcards",
  tags: "Tags",
};

/** How long a card shows an image; each card adds a little so they don't all change at once. */
const SHOW_MS = 3800;
const fade = { duration: 0.6, ease: "easeInOut" } as const;

const label = (name: string) =>
  name
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, "") ?? name;

export function SectionHead({
  title,
  icon,
  action,
}: {
  title: string;
  icon: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon name={icon} size={15} className="text-fg-3" />
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      <div className="ml-auto flex items-center gap-2">{action}</div>
    </div>
  );
}

/** A card's pictures, crossfading to the next every few seconds while the gallery is on screen. */
function Slideshow({
  images,
  active,
  index: order,
  fallback,
}: {
  images: string[];
  active: boolean;
  /** The card's place in its row: staggers the changes. */
  index: number;
  fallback: ReactNode;
}) {
  const [at, setAt] = useState(0);
  const reduced = useReducedMotion();
  const n = images.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: each change starts the next wait
  useEffect(() => {
    if (!active || reduced || n < 2) return;
    const t = setTimeout(() => setAt((i) => (i + 1) % n), SHOW_MS + (order % 5) * 650);
    return () => clearTimeout(t);
  }, [at, active, reduced, n, order]);
  // Load the next picture before it fades in.
  useEffect(() => {
    if (n > 1) new Image().src = images[(at + 1) % n] as string;
  }, [at, n, images]);
  const src = images[at % Math.max(n, 1)];
  if (!src)
    return <span className="absolute inset-0 grid place-items-center text-fg-4">{fallback}</span>;
  return (
    <AnimatePresence initial={false}>
      <motion.img
        key={src}
        src={src}
        alt=""
        draggable={false}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fade}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
      />
    </AnimatePresence>
  );
}

/** Home's rows use fixed widths; a grid's cards fill their cell. */
const SIZES = {
  row: "aspect-[4/5] w-[168px] shrink-0",
  rowSmall: "aspect-square w-[132px] shrink-0",
  fill: "aspect-[4/5] w-full",
} as const;

const meta = (u: HomeUse) => `${u.total.toLocaleString()} ${u.total === 1 ? "image" : "images"}`;

/** One model, LoRA, wildcard or tag: its images, name and how often, and where a click goes. */
export function UseCard({
  kind,
  use,
  active,
  index,
  size,
}: {
  kind: UseKind;
  use: HomeUse;
  active: boolean;
  index: number;
  size: keyof typeof SIZES;
}) {
  const navigate = useNavigate();
  const profileId = useSession((s) => s.profileId);
  // A model or LoRA without images in the gallery shows its own picture.
  const thumb = useModelThumb(
    kind === "loras" ? "loras" : "checkpoints",
    kind === "models" || kind === "loras" ? use.name : "",
  );
  const images = use.images.length ? use.images : thumb ? [thumb] : [];
  const title =
    kind === "wildcards"
      ? `__${use.name}__`
      : kind === "tags"
        ? use.name.replace(/_/g, " ")
        : label(use.name);
  const show = useGalleryUi.getState().show;
  const open = () => {
    if (kind === "wildcards") {
      if (profileId)
        void navigate({ to: "/p/$profileId/$view", params: { profileId, view: "wildcards" } });
    } else if (use.filter)
      show(
        kind === "models"
          ? { model: use.filter }
          : kind === "loras"
            ? { lora: use.filter }
            : { q: use.filter },
      );
  };
  const disabled = (kind === "models" || kind === "loras") && !use.filter;
  return (
    <button
      type="button"
      onClick={open}
      disabled={disabled}
      title={
        kind === "wildcards"
          ? "Open Wildcards"
          : kind === "tags"
            ? "Search for it"
            : disabled
              ? "No images with it in the gallery"
              : `Show images made with ${title}`
      }
      className={cn(
        "group relative overflow-hidden rounded-lg border border-line bg-sunken text-left transition-colors hover:border-accent/70 focus-ring disabled:hover:border-line",
        SIZES[size],
      )}
    >
      <Slideshow
        images={images}
        active={active}
        index={index}
        fallback={<Icon name={USE_ICON[kind]} size={28} strokeWidth={1.25} />}
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/85 via-black/40 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-2.5">
        <span className="line-clamp-2 text-xs font-medium break-words text-white">{title}</span>
        <span className="font-mono text-2xs text-white/70 tabular">{meta(use)}</span>
      </span>
    </button>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-fg-3">{children}</p>;
}

const EMPTY: Record<UseKind, string> = {
  models: "The models you generate with show up here.",
  loras: "The LoRAs you generate with show up here.",
  wildcards: "The wildcards you prompt with show up here.",
  tags: "Tags you prompt with show up here once you've used them a few times.",
};
export const emptyText = (kind: UseKind) => EMPTY[kind];

/** "See all" opens the kind's Most used view. */
function SeeAll({ kind }: { kind: UseKind }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      iconRight="arrow-right"
      onClick={() => useGalleryUi.getState().set({ view: "uses", uses: kind, drawer: false })}
    >
      See all
    </Button>
  );
}

/** One of Home's rows: models, LoRAs or wildcards, used lately first. */
export function UseRow({
  kind,
  uses,
  active,
}: {
  kind: Exclude<UseKind, "tags">;
  uses: HomeUse[];
  active: boolean;
}) {
  return (
    <section>
      <SectionHead
        title={`${USE_LABEL[kind]} you use`}
        icon={USE_ICON[kind]}
        action={uses.length ? <SeeAll kind={kind} /> : null}
      />
      {uses.length ? (
        <div className="scroll-quiet -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
          {uses.map((u, i) => (
            <UseCard key={u.name} kind={kind} use={u} active={active} index={i} size="row" />
          ))}
        </div>
      ) : (
        <Hint>{EMPTY[kind]}</Hint>
      )}
    </section>
  );
}

/** Home's tags: lately (the last two weeks) or ever. */
export function TagRow({ tags, active }: { tags: GalleryHome["tags"]; active: boolean }) {
  const [when, setWhen] = useState<"lately" | "top">(tags.lately.length ? "lately" : "top");
  const list = tags[when];
  return (
    <section>
      <SectionHead
        title="Tags you use"
        icon={USE_ICON.tags}
        action={
          <>
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
            {tags.top.length ? <SeeAll kind="tags" /> : null}
          </>
        }
      />
      {list.length ? (
        <div className="scroll-quiet -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
          {list.map((t, i) => (
            <UseCard key={t.name} kind="tags" use={t} active={active} index={i} size="rowSmall" />
          ))}
        </div>
      ) : (
        <Hint>
          {when === "lately"
            ? "Nothing in the last two weeks. Tags you prompt with show up here."
            : EMPTY.tags}
        </Hint>
      )}
    </section>
  );
}
