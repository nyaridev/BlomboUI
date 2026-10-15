/**
 * Gallery as a showcase: library sidebar, a featured hero, day sections in justified rows,
 * and a lightbox with a metadata sheet. PREVIEW: procedural images stand in for real outputs.
 */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useElementWidth, useHotkey } from "@client/lib/hooks";
import { glide } from "@client/lib/motion";
import { rng } from "@client/lib/seeded";
import {
  Art,
  Badge,
  Button,
  Chip,
  IconButton,
  Segmented,
  Select,
  Slider,
  TextField,
  toast,
} from "@client/ui";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { justify } from "./justify";

interface Img {
  id: string;
  ratio: number;
  model: string;
  fav: boolean;
}

const RATIOS = [832 / 1216, 832 / 1216, 896 / 1152, 1, 1216 / 832, 768 / 1344, 1344 / 768];
const MODELS = ["WAI Illustrious v14", "NoobAI XL", "Hassaku XL", "Juggernaut XL"];

function makeImages(seed: string, n: number): Img[] {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: `${seed}-${i}`,
    ratio: RATIOS[Math.floor(r() * RATIOS.length)] ?? 1,
    model: MODELS[Math.floor(r() * MODELS.length)] ?? "",
    fav: r() > 0.82,
  }));
}

const SECTIONS = [
  { id: "today", title: "Today", sub: "Illustrious · Portrait", images: makeImages("today", 14) },
  {
    id: "yesterday",
    title: "Yesterday",
    sub: "NoobAI · 3 workflows",
    images: makeImages("yday", 22),
  },
  {
    id: "oct12",
    title: "Sunday, October 12",
    sub: "Backgrounds batch",
    images: makeImages("oct12", 18),
  },
];

const LIBRARIES: Array<{
  id: string;
  label: string;
  icon: IconName;
  count: number;
  seed?: string;
}> = [
  { id: "all", label: "All images", icon: "gallery", count: 18342 },
  { id: "fav", label: "Favorites", icon: "heart", count: 1208 },
  { id: "recent", label: "This week", icon: "calendar", count: 412 },
];
const FOLDERS = [
  { id: "outputs", label: "Outputs", count: 16120, seed: "lib-out" },
  { id: "portraits", label: "Portraits", count: 1406, seed: "lib-por" },
  { id: "backgrounds", label: "Backgrounds", count: 612, seed: "lib-bg" },
  { id: "refs", label: "References", count: 204, seed: "lib-ref" },
];

export function GalleryView() {
  const [lib, setLib] = useState("all");
  const [layout, setLayout] = useState<"justified" | "grid">("justified");
  const [size, setSize] = useState(220);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Img | null>(null);
  const all = useMemo(() => SECTIONS.flatMap((s) => s.images), []);

  return (
    <div className="flex h-full">
      <aside className="scroll-quiet flex w-[248px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-3">
        {LIBRARIES.map((l) => (
          <SideItem
            key={l.id}
            active={lib === l.id}
            onClick={() => setLib(l.id)}
            icon={l.icon}
            label={l.label}
            count={l.count}
          />
        ))}
        <div className="label-caps mt-4 mb-1 flex items-center justify-between px-2 text-[10px]">
          Libraries
          <IconButton icon="plus" label="Add library" size="xs" />
        </div>
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setLib(f.id)}
            className={cn(
              "group flex items-center gap-2.5 rounded-md p-1.5 text-left transition-colors focus-ring",
              lib === f.id ? "bg-field" : "hover:bg-field/60",
            )}
          >
            <Art seed={f.seed} className="h-9 w-9 shrink-0 rounded-md" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn("truncate text-sm", lib === f.id ? "text-fg" : "text-fg-2")}>
                {f.label}
              </span>
              <span className="font-mono text-2xs text-fg-3 tabular">
                {f.count.toLocaleString()}
              </span>
            </span>
          </button>
        ))}
        <div className="label-caps mt-4 mb-1 px-2 text-[10px]">Collections</div>
        <SideItem
          active={false}
          onClick={() => undefined}
          icon="star"
          label="Best of October"
          count={48}
        />
        <SideItem
          active={false}
          onClick={() => undefined}
          icon="star"
          label="Client: Moonlit"
          count={23}
        />
        <div className="mt-auto pt-4">
          <SideItem
            active={false}
            onClick={() => undefined}
            icon="trash"
            label="Trash"
            count={37}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line px-5 py-2.5">
          <TextField
            icon="search"
            placeholder="Search prompts, models, LoRAs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            className="w-[360px]"
          />
          <div className="flex gap-1">
            <Chip size="sm" icon="models">
              Model
            </Chip>
            <Chip size="sm" icon="layers">
              LoRA
            </Chip>
            <Chip size="sm" icon="calendar">
              Date
            </Chip>
            <Chip size="sm" icon="heart" selected>
              Favorites
            </Chip>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-28">
              <Slider
                value={size}
                onChange={setSize}
                min={140}
                max={360}
                step={10}
                size="sm"
                label={undefined}
              />
            </div>
            <Segmented
              size="sm"
              value={layout}
              onChange={setLayout}
              label="Layout"
              options={[
                { value: "justified", icon: "layout-rows", title: "Justified rows" },
                { value: "grid", icon: "layout-grid", title: "Grid" },
              ]}
            />
            <Select
              size="sm"
              value="newest"
              onChange={() => undefined}
              className="w-[130px]"
              options={[
                { value: "newest", label: "Newest first", icon: "sort" },
                { value: "oldest", label: "Oldest first", icon: "sort" },
                { value: "rated", label: "Top rated", icon: "star" },
              ]}
            />
          </div>
        </div>

        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 pb-10">
          <Hero onOpen={() => setOpen(all[3] ?? null)} />
          {SECTIONS.map((s, i) => (
            <motion.section
              key={s.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...glide, delay: 0.1 + i * 0.06 }}
              className="mt-8"
            >
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-fg">{s.title}</h2>
                <span className="text-sm text-fg-3">
                  {s.images.length} images · {s.sub}
                </span>
                <Button size="sm" variant="ghost" className="ml-auto" iconRight="chevron-right">
                  Open day
                </Button>
              </div>
              {layout === "justified" ? (
                <Justified images={s.images} height={size} onOpen={setOpen} />
              ) : (
                <div
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}
                >
                  {s.images.map((img) => (
                    <Tile key={img.id} img={img} onOpen={() => setOpen(img)} square />
                  ))}
                </div>
              )}
            </motion.section>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <Lightbox images={all} current={open} onChange={setOpen} onClose={() => setOpen(null)} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SideItem({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors focus-ring",
        active ? "bg-field text-fg" : "text-fg-2 hover:bg-field/60 hover:text-fg",
      )}
    >
      <Icon name={icon} size={15} className={active ? "text-accent-ink" : "text-fg-3"} />
      <span className="flex-1 truncate text-left">{label}</span>
      <span className="font-mono text-2xs text-fg-3 tabular">{count.toLocaleString()}</span>
    </button>
  );
}

function Hero({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="relative mt-5 h-[300px] overflow-hidden rounded-2xl border border-line">
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.08 }}
        animate={{ scale: 1 }}
        transition={{ duration: 6, ease: "easeOut" }}
      >
        <Art seed="featured-hero" className="h-full w-full" />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-transparent" />
      <div className="absolute inset-y-0 left-0 flex max-w-[520px] flex-col justify-end gap-3 p-7">
        <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-white/70 uppercase">
          <Icon name="star" size={13} className="fill-current text-yellow-ink" /> Featured favorite
        </span>
        <h2 className="text-3xl font-semibold tracking-tight text-balance text-white">
          Silver-haired wanderer in a misty dawn forest
        </h2>
        <p className="line-clamp-2 text-sm text-white/70">
          WAI Illustrious v14 · Detailer Slider 0.8 · Ghibli Background 0.6 · 832×1216 → hires 1.5×
        </p>
        <div className="flex gap-2">
          <Button variant="primary" icon="maximize" onClick={onOpen}>
            View
          </Button>
          <Button
            icon="generate"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            Use these settings
          </Button>
        </div>
      </div>
      <div className="absolute right-5 bottom-5 flex gap-1.5">
        {["hero-a", "hero-b", "hero-c"].map((s, i) => (
          <span
            key={s}
            className={cn(
              "h-1.5 rounded-full bg-white transition-all",
              i === 0 ? "w-6" : "w-1.5 opacity-40",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Justified({
  images,
  height,
  onOpen,
}: {
  images: Img[];
  height: number;
  onOpen: (img: Img) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const rows = useMemo(
    () => justify(images, (i) => i.ratio, width, height, 6),
    [images, width, height],
  );
  return (
    <div ref={ref} className="flex flex-col gap-1.5">
      {rows.map((row, r) => (
        <div key={r} className="flex gap-1.5">
          {row.map(({ item, width: w, height: h }) => (
            <div key={item.id} style={{ width: w, height: h }} className="shrink-0">
              <Tile img={item} onOpen={() => onOpen(item)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Tile({ img, onOpen, square }: { img: Img; onOpen: () => void; square?: boolean }) {
  return (
    <div
      className={cn(
        "group relative h-full w-full overflow-hidden rounded-md bg-sunken",
        square && "aspect-square",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open image"
        className="absolute inset-0 focus-ring"
      >
        <Art
          seed={img.id}
          className="h-full w-full transition-transform duration-500 group-hover:scale-[1.035]"
        />
      </button>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center gap-1.5 text-2xs text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
        <Icon name="models" size={11} /> <span className="truncate">{img.model}</span>
      </div>
      <button
        type="button"
        aria-label={img.fav ? "Unfavorite" : "Favorite"}
        className={cn(
          "absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/40 text-white transition-opacity hover:bg-black/60",
          img.fav ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <Icon
          name="heart"
          size={14}
          className={img.fav ? "fill-current text-pink-ink" : undefined}
        />
      </button>
    </div>
  );
}

function Lightbox({
  images,
  current,
  onChange,
  onClose,
}: {
  images: Img[];
  current: Img;
  onChange: (i: Img) => void;
  onClose: () => void;
}) {
  const idx = images.findIndex((i) => i.id === current.id);
  const go = useCallback(
    (d: number) => {
      const next = images[(idx + d + images.length) % images.length];
      if (next) onChange(next);
    },
    [idx, images, onChange],
  );
  useHotkey("Escape", onClose);
  useHotkey("ArrowRight", () => go(1));
  useHotkey("ArrowLeft", () => go(-1));
  return (
    <motion.div
      className="fixed inset-0 z-[250] flex bg-black/92"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
    >
      <div className="relative flex min-w-0 flex-1 flex-col [container-type:size]">
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-8">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={glide}
            className="overflow-hidden rounded-md shadow-pop"
            style={{
              aspectRatio: String(current.ratio),
              width: `min(100cqw - 64px, (100cqh - 160px) * ${current.ratio})`,
            }}
          >
            <Art seed={current.id} className="h-full w-full" />
          </motion.div>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => go(-1)}
            className="absolute left-4 grid h-11 w-11 place-items-center rounded-full bg-white/8 text-white/80 hover:bg-white/15 focus-ring"
          >
            <Icon name="chevron-left" size={22} />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => go(1)}
            className="absolute right-4 grid h-11 w-11 place-items-center rounded-full bg-white/8 text-white/80 hover:bg-white/15 focus-ring"
          >
            <Icon name="chevron-right" size={22} />
          </button>
        </div>
        <div className="scroll-quiet flex h-[86px] shrink-0 items-center justify-center gap-1.5 overflow-x-auto px-6 pb-4">
          {images.slice(Math.max(0, idx - 8), idx + 9).map((i) => (
            <button
              key={i.id}
              type="button"
              aria-label="Show image"
              onClick={() => onChange(i)}
              className={cn(
                "h-16 shrink-0 overflow-hidden rounded-sm border-2 transition-all",
                i.id === current.id
                  ? "border-white"
                  : "border-transparent opacity-50 hover:opacity-90",
              )}
              style={{ width: 64 * i.ratio }}
            >
              <Art seed={i.id} className="h-full w-full" />
            </button>
          ))}
        </div>
      </div>
      <aside className="flex w-[360px] shrink-0 flex-col border-l border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="text-sm font-semibold text-fg">Details</span>
          <Badge>
            {idx + 1} / {images.length}
          </Badge>
          <span className="ml-auto flex">
            <IconButton icon="heart" label="Favorite" size="sm" />
            <IconButton icon="x" label="Close (Esc)" size="sm" onClick={onClose} />
          </span>
        </div>
        <div className="scroll-quiet flex flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-col gap-1.5">
            <span className="label-caps">Prompt</span>
            <p className="rounded-md border border-line bg-field p-2.5 text-sm leading-relaxed text-fg-2">
              masterpiece, best quality, 1girl, solo,{" "}
              <span className="text-syn-weight">(silver hair:1.2)</span>, long hair, fantasy cloak,
              misty forest at dawn, volumetric light
            </p>
          </div>
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            {[
              ["Model", current.model],
              ["Sampler", "Euler a · Karras"],
              ["Steps / CFG", "28 / 5.5"],
              ["Seed", "284119032"],
              ["Size", "1248×1824 (hires 1.5×)"],
              ["LoRAs", "Detailer Slider 0.8, Ghibli BG 0.6"],
              ["Workflow", "Illustrious · Portrait"],
              ["Time", "9.2 s"],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-fg-3">{k}</dt>
                <dd className="truncate text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="grid grid-cols-2 gap-1.5">
            <Button icon="generate" onClick={() => toast("Settings sent to Generate", "success")}>
              Use settings
            </Button>
            <Button icon="pose">As ControlNet</Button>
            <Button icon="file-info">File info</Button>
            <Button icon="folder-open">Reveal</Button>
            <Button icon="copy">Copy</Button>
            <Button icon="trash" variant="danger">
              Remove
            </Button>
          </div>
        </div>
      </aside>
    </motion.div>
  );
}
