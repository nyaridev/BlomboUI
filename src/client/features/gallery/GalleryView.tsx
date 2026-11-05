/**
 * Gallery: the profile's outputs and library folders, indexed on the server. Sidebar (Home,
 * views, libraries, trash, scan status) + Home (home/HomeView.tsx) or an image list: toolbar
 * (search, model and LoRA filters, size, layout, sort) + a virtualized grid in day sections (one
 * continuous grid for Recent and Shuffle), with a showcase hero on All images and a lightbox.
 * New images arrive over the live bus while generating. Images dropped on it are added (From your
 * PC).
 */

import { useCompact } from "@client/lib/hooks";
import { followTopic, useLive } from "@client/lib/live";
import {
  useGalleryImages,
  useGalleryOverview,
  useSettings,
  useUpdateSettings,
} from "@client/lib/queries";
import { useSession } from "@client/lib/session";
import { Button, EmptyState, openContextMenu, Sheet, Skeleton } from "@client/ui";
import type { GalleryImage } from "@shared/gallery";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { viewFromPath } from "../../app/router";
import { PageDropOverlay } from "../fileinfo/PageDrop";
import { useGalleryDrop } from "./AddToGallery";
import { Grid } from "./Grid";
import { HomeView } from "./home/HomeView";
import { UsesView } from "./home/UsesView";
import { useImageMenu } from "./imageMenu";
import { Lightbox } from "./Lightbox";
import { Sidebar } from "./Sidebar";
import { galleryQuery, isHomeView, useGalleryUi } from "./state";
import { Toolbar } from "./Toolbar";
import { TrashView } from "./TrashView";

export function GalleryView() {
  useEffect(() => followTopic("gallery"), []);
  const overview = useGalleryOverview();
  const view = useGalleryUi((s) => s.view);
  const uses = useGalleryUi((s) => s.uses);
  const drawer = useGalleryUi((s) => s.drawer);
  const set = useGalleryUi((s) => s.set);
  const compact = useCompact();
  const sidebar = <Sidebar overview={overview.data} />;
  // The gallery stays mounted behind other views: its lightbox (and its keys: Delete, arrows,
  // ratings) mustn't stay open there.
  const visible = useRouterState({
    select: (s) => viewFromPath(s.location.pathname) === "gallery",
  });
  useEffect(() => {
    if (!visible && useGalleryUi.getState().open !== null)
      useGalleryUi.getState().set({ open: null });
  }, [visible]);
  const dragging = useGalleryDrop(visible);
  return (
    <div className="flex h-full">
      <PageDropOverlay
        show={dragging}
        icon="gallery"
        title="Drop to add to your gallery"
        text="PNG, WebP and JPEG images are copied into your outputs folder's imported/ folder"
      />
      {compact ? (
        <Sheet open={drawer} onOpenChange={(o) => set({ drawer: o })} label="Libraries">
          {sidebar}
        </Sheet>
      ) : (
        sidebar
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {view === "trash" ? (
          <TrashView />
        ) : view === "home" ? (
          <HomeView visible={visible} />
        ) : view === "uses" ? (
          <UsesView key={uses} kind={uses} visible={visible} />
        ) : (
          <Images featured={overview.data?.featured ?? []} visible={visible} />
        )}
      </div>
    </div>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Leave the gallery for Generate (Use these settings) or File info, closing the lightbox. */
export function useGalleryGo() {
  const navigate = useNavigate();
  const profileId = useSession((s) => s.profileId);
  return useCallback(
    (v: "generate" | "file-info") => {
      useGalleryUi.getState().set({ open: null });
      if (profileId) void navigate({ to: "/p/$profileId/$view", params: { profileId, view: v } });
    },
    [navigate, profileId],
  );
}

function Images({ featured, visible }: { featured: GalleryImage[]; visible: boolean }) {
  const ui = useGalleryUi();
  const q = useDebounced(ui.q, 250);
  const { library, favorites, since, model, lora, sort, seed, rating, tag, collection, origins } =
    ui;
  const query = useMemo(
    () =>
      galleryQuery(
        { library, favorites, since, model, lora, sort, seed, rating, tag, collection, origins },
        q,
      ),
    [library, favorites, since, model, lora, sort, seed, rating, tag, collection, origins, q],
  );
  const images = useGalleryImages(query);
  // Offset pages can overlap when images arrive or leave between them: show each image once.
  const items = useMemo(() => {
    const seen = new Set<number>();
    return (images.data?.pages.flatMap((p) => p.items) ?? []).filter(
      (i) => !seen.has(i.id) && Boolean(seen.add(i.id)),
    );
  }, [images.data]);
  const total = images.data?.pages[0]?.total ?? 0;
  const galleryNew = useLive((s) => s.galleryNew);

  // Layout and tile size are settings; the slider updates at once and saves when it rests.
  const settings = useSettings().data?.gallery;
  const update = useUpdateSettings();
  const [size, setSize] = useState<number | null>(null);
  const tileSize = size ?? settings?.tileSize ?? 220;
  const layout = settings?.layout ?? "justified";
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeSize = (v: number) => {
    setSize(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => update.mutate({ gallery: { tileSize: v } }), 500);
  };

  const go = useGalleryGo();

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = images;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // "N new images since this list loaded" counts from the list on screen.
  useEffect(() => {
    void query;
    useLive.setState({ galleryNew: 0 });
  }, [query]);
  const onOpen = useCallback((id: number) => useGalleryUi.getState().set({ open: id }), []);
  const onUseSettings = useCallback(() => go("generate"), [go]);
  // The menu reads the latest hooks through a ref, so the grid's tiles keep one callback.
  const imageMenu = useImageMenu(onOpen, go);
  const menuRef = useRef(imageMenu);
  menuRef.current = imageMenu;
  const onMenu = useCallback(
    (e: MouseEvent<HTMLElement>, image: GalleryImage) => openContextMenu(e, menuRef.current(image)),
    [],
  );

  const open = ui.open !== null && visible ? items.find((i) => i.id === ui.open) : undefined;
  const home = isHomeView({ ...ui, q });

  return (
    <>
      <Toolbar
        size={tileSize}
        onSize={changeSize}
        layout={layout}
        onLayout={(l) => update.mutate({ gallery: { layout: l } })}
        total={images.data ? total : null}
      />
      {galleryNew > 0 && !home ? (
        <div className="flex items-center justify-center gap-2 border-b border-line bg-accent/10 py-1.5 text-xs text-fg-2">
          {galleryNew} new {galleryNew === 1 ? "image" : "images"} since this list loaded.
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              useLive.setState({ galleryNew: 0 });
              void images.refetch();
            }}
          >
            Show
          </Button>
        </div>
      ) : null}
      {images.isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1.5 p-5">
          {Array.from({ length: 18 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : images.error ? (
        <EmptyState
          icon="errors"
          tone="warning"
          title="The gallery couldn't load"
          text={images.error.message}
          action={<Button onClick={() => void images.refetch()}>Try again</Button>}
        />
      ) : items.length === 0 ? (
        <Empty home={home} />
      ) : (
        <Grid
          items={items}
          total={total}
          layout={layout}
          size={tileSize}
          byDay={!ui.flat && ui.sort !== "name" && ui.sort !== "random"}
          featured={home ? featured : []}
          hasMore={Boolean(hasNextPage)}
          loadingMore={isFetchingNextPage}
          onLoadMore={loadMore}
          onOpen={onOpen}
          onMenu={onMenu}
          onUseSettings={onUseSettings}
        />
      )}
      <AnimatePresence>
        {open ? (
          <Lightbox
            key="lightbox"
            images={items}
            current={open}
            onChange={(id) => ui.set({ open: id })}
            onClose={() => ui.set({ open: null })}
            onNeedMore={loadMore}
            onGo={go}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Empty({ home }: { home: boolean }) {
  const reset = useGalleryUi((s) => s.reset);
  const navigate = useNavigate();
  const profileId = useSession((s) => s.profileId);
  if (!home)
    return (
      <EmptyState
        icon="search"
        title="Nothing matches"
        text="No images match these filters. Clear them to see everything."
        action={<Button onClick={reset}>Clear filters</Button>}
      />
    );
  return (
    <EmptyState
      icon="gallery"
      title="Your images will appear here"
      text="Everything in your outputs folder, and any folder you add, shows up here newest first. Generate something, or add a folder from the sidebar."
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
