/**
 * Home's sections under the carousel: the models, LoRAs and wildcards you run and the tags you
 * prompt with, as picture cards that crossfade through their newest images. A model or LoRA
 * filters the image list, a tag searches it, a wildcard opens Wildcards.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useSession } from "@client/lib/session";
import { Segmented } from "@client/ui";
import type { GalleryHome, HomeTag, HomeUse } from "@shared/gallery";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { useModelThumb } from "../../models/thumbs";
import { useGalleryUi } from "../state";

type Kind = "models" | "loras" | "wildcards";

const ICON: Record<Kind | "tags", IconName> = {
  models: "models",
  loras: "layers",
  wildcards: "wildcards",
  tags: "tag",
};

/** How long a card shows an image; each card adds a little so they don't all change at once. */
const SHOW_MS = 3800;
const fade = { duration: 0.6, ease: "easeInOut" } as const;

const show = (patch: Parameters<ReturnType<typeof useGalleryUi.getState>["show"]>[0]) =>
  useGalleryUi.getState().show(patch);

const label = (name: string) =>
  name
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.(safetensors|ckpt|pt|pth|bin|gguf|sft)$/i, "") ?? name;

function SectionHead({
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
      <div className="ml-auto">{action}</div>
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

function Card({
  images,
  active,
  index,
  icon,
  title,
  meta,
  onOpen,
  disabled,
  hint,
  small,
}: {
  images: string[];
  active: boolean;
  index: number;
  icon: IconName;
  title: string;
  meta: string;
  onOpen: () => void;
  disabled?: boolean;
  hint: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      title={hint}
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-lg border border-line bg-sunken text-left transition-colors hover:border-accent/70 focus-ring disabled:hover:border-line",
        small ? "aspect-square w-[180px]" : "aspect-[4/5] w-[240px]",
      )}
    >
      <Slideshow
        images={images}
        active={active}
        index={index}
        fallback={<Icon name={icon} size={32} strokeWidth={1.25} />}
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/85 via-black/40 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3">
        <span className="line-clamp-2 text-sm font-medium break-words text-white">{title}</span>
        <span className="font-mono text-2xs text-white/70 tabular">{meta}</span>
      </span>
    </button>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="scroll-quiet -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">{children}</div>;
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-fg-3">{children}</p>;
}

const runs = (u: HomeUse) =>
  `${u.count.toLocaleString()} ${u.count === 1 ? "run" : "runs"}${
    u.recent && u.recent < u.count ? ` · ${u.recent.toLocaleString()} lately` : ""
  }`;

const TITLES: Record<Kind, string> = {
  models: "Models you use",
  loras: "LoRAs you use",
  wildcards: "Wildcards you use",
};

/** Models, LoRAs or wildcards as large picture cards. */
export function UseCards({ what, uses, active }: { what: Kind; uses: HomeUse[]; active: boolean }) {
  const navigate = useNavigate();
  const profileId = useSession((s) => s.profileId);
  const open = (u: HomeUse) => {
    if (what === "wildcards") {
      if (profileId)
        void navigate({ to: "/p/$profileId/$view", params: { profileId, view: "wildcards" } });
    } else if (u.filter) show(what === "models" ? { model: u.filter } : { lora: u.filter });
  };
  return (
    <section>
      <SectionHead title={TITLES[what]} icon={ICON[what]} />
      {uses.length ? (
        <Row>
          {uses.map((u, i) =>
            what === "wildcards" ? (
              <Card
                key={u.name}
                images={u.images}
                active={active}
                index={i}
                icon={ICON.wildcards}
                title={`__${u.name}__`}
                meta={runs(u)}
                onOpen={() => open(u)}
                hint="Open Wildcards"
              />
            ) : (
              <ModelCard
                key={u.name}
                what={what}
                use={u}
                active={active}
                index={i}
                onOpen={() => open(u)}
              />
            ),
          )}
        </Row>
      ) : (
        <Hint>{`The ${what === "loras" ? "LoRAs" : what} you generate with show up here.`}</Hint>
      )}
    </section>
  );
}

/** A model or LoRA: your images with it, or its own picture when the gallery has none. */
function ModelCard({
  what,
  use,
  active,
  index,
  onOpen,
}: {
  what: "models" | "loras";
  use: HomeUse;
  active: boolean;
  index: number;
  onOpen: () => void;
}) {
  const thumb = useModelThumb(what === "models" ? "checkpoints" : "loras", use.name);
  return (
    <Card
      images={use.images.length ? use.images : thumb ? [thumb] : []}
      active={active}
      index={index}
      icon={ICON[what]}
      title={label(use.name)}
      meta={runs(use)}
      onOpen={onOpen}
      disabled={!use.filter}
      hint={
        use.filter ? `Show images made with ${label(use.name)}` : "No images with it in the gallery"
      }
    />
  );
}

/** The tags you prompt with, lately (the last two weeks) or ever, as smaller picture cards. */
export function TagCards({ tags, active }: { tags: GalleryHome["tags"]; active: boolean }) {
  const [when, setWhen] = useState<"lately" | "top">(tags.lately.length ? "lately" : "top");
  const list: HomeTag[] = tags[when];
  return (
    <section>
      <SectionHead
        title="Tags you use"
        icon={ICON.tags}
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
        <Row>
          {list.map((t, i) => (
            <Card
              key={t.tag}
              small
              images={t.images}
              active={active}
              index={i}
              icon={ICON.tags}
              title={t.tag.replace(/_/g, " ")}
              meta={`${t.uses.toLocaleString()} ${t.uses === 1 ? "use" : "uses"}`}
              // Tags are counted with underscores; prompts often use spaces.
              onOpen={() => show({ q: t.tag.replace(/_/g, " ") })}
              hint="Search for it"
            />
          ))}
        </Row>
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
