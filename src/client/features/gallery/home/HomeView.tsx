/**
 * The gallery's Home: a carousel of random recent images, then the newest ones and what you've
 * been prompting with (tags, models, LoRAs, wildcards), each a way into the image list.
 * Three layouts on trial (`useVariant`): Spotlight, Coverflow, Bento.
 */
import { useGalleryHome } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { useVariant } from "@client/lib/variants";
import { Button, EmptyState, Skeleton } from "@client/ui";
import type { GalleryHome, GalleryImage } from "@shared/gallery";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { useGalleryGo } from "../GalleryView";
import { Lightbox } from "../Lightbox";
import { SidebarButton } from "../Sidebar";
import { newSeed, useGalleryUi } from "../state";
import { Bento, type CarouselProps, Coverflow, Spotlight } from "./carousels";
import { RecentStrip, TagsPanel, UseCards, UseList, WildcardChips } from "./sections";

const LAYOUTS = [
  { id: "spotlight", label: "Spotlight" },
  { id: "coverflow", label: "Coverflow" },
  { id: "bento", label: "Bento" },
] as const;

export function HomeView({ visible }: { visible: boolean }) {
  const [seed, setSeed] = useState(newSeed);
  const home = useGalleryHome(seed);
  const layout = useVariant("gallery-home", "Gallery home", LAYOUTS);
  const open = useGalleryUi((s) => s.open);
  const set = useGalleryUi((s) => s.set);
  const go = useGalleryGo();
  const onOpen = useCallback((id: number) => set({ open: id }), [set]);
  const onUseSettings = useCallback(() => go("generate"), [go]);

  // The lightbox steps through the carousel's images, then the newest ones.
  const images = useMemo(() => {
    const seen = new Set<number>();
    return [...(home.data?.picks ?? []), ...(home.data?.recent ?? [])].filter(
      (i) => !seen.has(i.id) && Boolean(seen.add(i.id)),
    );
  }, [home.data]);
  const current = open !== null && visible ? images.find((i) => i.id === open) : undefined;

  const data = home.data;
  return (
    <>
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-5 max-lg:px-3">
        <SidebarButton />
        <h1 className="text-sm font-semibold text-fg">Home</h1>
        {data?.picks.length ? (
          <Button
            variant="ghost"
            size="sm"
            icon="shuffle"
            className="ml-auto"
            onClick={() => setSeed(newSeed())}
          >
            Shuffle picks
          </Button>
        ) : null}
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        {home.isLoading ? (
          <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-5">
            <Skeleton className="h-[clamp(300px,52vh,560px)] rounded-xl" />
            <Skeleton className="h-40" />
          </div>
        ) : home.error ? (
          <EmptyState
            icon="errors"
            tone="warning"
            title="Home couldn't load"
            text={home.error.message}
            action={<Button onClick={() => void home.refetch()}>Try again</Button>}
          />
        ) : !data?.picks.length ? (
          <Empty />
        ) : (
          <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-6 py-5 max-lg:px-3">
            <Layout
              layout={layout}
              data={data}
              carousel={{
                // A new shuffle starts the carousel over.
                images: data.picks,
                active: visible && open === null,
                onOpen,
                onUseSettings,
              }}
              seed={seed}
              onOpen={onOpen}
            />
          </div>
        )}
      </div>
      <AnimatePresence>
        {current ? (
          <Lightbox
            key="lightbox"
            images={images}
            current={current}
            onChange={(id) => set({ open: id })}
            onClose={() => set({ open: null })}
            onNeedMore={() => undefined}
            onGo={go}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Layout({
  layout,
  data,
  carousel,
  seed,
  onOpen,
}: {
  layout: (typeof LAYOUTS)[number]["id"];
  data: GalleryHome;
  carousel: CarouselProps;
  seed: number;
  onOpen: (id: number) => void;
}) {
  const recent: GalleryImage[] = data.recent;
  if (layout === "coverflow")
    return (
      <>
        <Coverflow key={seed} {...carousel} />
        <div className="grid grid-cols-3 gap-6 max-lg:grid-cols-1">
          <UseList what="models" uses={data.models} />
          <UseList what="loras" uses={data.loras} />
          <UseList what="wildcards" uses={data.wildcards} />
        </div>
        <TagsPanel tags={data.tags} />
        <RecentStrip images={recent} onOpen={onOpen} />
      </>
    );
  if (layout === "bento")
    return (
      <>
        <Bento key={seed} {...carousel} />
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-8 max-lg:grid-cols-1">
          <RecentStrip images={recent} onOpen={onOpen} tall />
          <TagsPanel tags={data.tags} />
        </div>
        <UseCards what="models" uses={data.models} />
        <UseCards what="loras" uses={data.loras} />
        <WildcardChips uses={data.wildcards} />
      </>
    );
  return (
    <>
      <Spotlight key={seed} {...carousel} />
      <RecentStrip images={recent} onOpen={onOpen} />
      <UseCards what="models" uses={data.models} />
      <UseCards what="loras" uses={data.loras} />
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-8 max-lg:grid-cols-1">
        <TagsPanel tags={data.tags} />
        <UseList what="wildcards" uses={data.wildcards} />
      </div>
    </>
  );
}

function Empty() {
  const navigate = useNavigate();
  const profileId = useSession((s) => s.profileId);
  return (
    <EmptyState
      icon="gallery"
      title="Your images will appear here"
      text="Home shows a few of your recent images and what you've been prompting with. Generate something, or add a folder from the sidebar."
      action={
        <Button
          variant="primary"
          icon="generate"
          onClick={() =>
            profileId &&
            void navigate({ to: "/p/$profileId/$view", params: { profileId, view: "generate" } })
          }
        >
          Open Generate
        </Button>
      }
    />
  );
}
