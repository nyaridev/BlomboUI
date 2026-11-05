/**
 * The gallery's Home: a carousel of random recent images, then what you've been prompting with
 * (models, LoRAs, wildcards, tags) as cards that crossfade through their newest images, each a
 * way into the image list.
 */
import { useGalleryHome } from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Button, EmptyState, Skeleton } from "@client/ui";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { useCallback, useState } from "react";
import { useGalleryGo } from "../GalleryView";
import { Lightbox } from "../Lightbox";
import { SidebarButton } from "../Sidebar";
import { newSeed, useGalleryUi } from "../state";
import { Coverflow } from "./Coverflow";
import { TagCards, UseCards } from "./sections";

export function HomeView({ visible }: { visible: boolean }) {
  const [seed, setSeed] = useState(newSeed);
  const home = useGalleryHome(seed);
  const open = useGalleryUi((s) => s.open);
  const set = useGalleryUi((s) => s.set);
  const go = useGalleryGo();
  const onOpen = useCallback((id: number) => set({ open: id }), [set]);
  const onUseSettings = useCallback(() => go("generate"), [go]);

  const data = home.data;
  const picks = data?.picks ?? [];
  const current = open !== null && visible ? picks.find((i) => i.id === open) : undefined;
  // Nothing moves behind other views or the lightbox.
  const active = visible && open === null;
  return (
    <>
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-5 max-lg:px-3">
        <SidebarButton />
        <h1 className="text-sm font-semibold text-fg">Home</h1>
        {picks.length ? (
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
            <Skeleton className="h-60" />
          </div>
        ) : home.error ? (
          <EmptyState
            icon="errors"
            tone="warning"
            title="Home couldn't load"
            text={home.error.message}
            action={<Button onClick={() => void home.refetch()}>Try again</Button>}
          />
        ) : !data || !picks.length ? (
          <Empty />
        ) : (
          <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-6 py-5 max-lg:px-3">
            {/* A new shuffle starts the carousel over. */}
            <Coverflow
              key={seed}
              images={picks}
              active={active}
              onOpen={onOpen}
              onUseSettings={onUseSettings}
            />
            <UseCards what="models" uses={data.models} active={active} />
            <UseCards what="loras" uses={data.loras} active={active} />
            <UseCards what="wildcards" uses={data.wildcards} active={active} />
            <TagCards tags={data.tags} active={active} />
          </div>
        )}
      </div>
      <AnimatePresence>
        {current ? (
          <Lightbox
            key="lightbox"
            images={picks}
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
