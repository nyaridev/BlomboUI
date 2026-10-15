/**
 * The app frame for an open profile: header + views. Generate and Gallery stay mounted after
 * the first visit (hidden when inactive) so switching back is instant and keeps their state.
 */
import { startLive } from "@client/lib/live";
import { glide } from "@client/lib/motion";
import { useProfile, useSettings } from "@client/lib/queries";
import { openProfileOnce } from "@client/lib/session";
import { toast } from "@client/ui";
import type { ViewId } from "@shared/constants";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { ComingSoon } from "../features/common/ComingSoon";
import { GalleryView } from "../features/gallery/GalleryView";
import { GenerateView } from "../features/generate/GenerateView";
import { Header } from "./header/Header";
import { viewFromPath } from "./router";
import { useTheme } from "./theme";

const KEEP_ALIVE: ViewId[] = ["generate", "gallery"];

// Views you don't open every session load on first visit, so startup only pays for Generate
// and Gallery.
const ModelsView = lazy(() =>
  import("../features/models/ModelsView").then((m) => ({ default: m.ModelsView })),
);
const FileInfoView = lazy(() =>
  import("../features/fileinfo/FileInfoView").then((m) => ({ default: m.FileInfoView })),
);
const WildcardsView = lazy(() =>
  import("../features/wildcards/WildcardsView").then((m) => ({ default: m.WildcardsView })),
);
const SettingsView = lazy(() =>
  import("../features/settings/SettingsView").then((m) => ({ default: m.SettingsView })),
);
const DesignLab = lazy(() =>
  import("../features/lab/DesignLab").then((m) => ({ default: m.DesignLab })),
);

function renderView(view: ViewId): ReactNode {
  switch (view) {
    case "generate":
      return <GenerateView />;
    case "gallery":
      return <GalleryView />;
    case "models":
      return <ModelsView />;
    case "file-info":
      return <FileInfoView />;
    case "wildcards":
      return <WildcardsView />;
    case "settings":
      return <SettingsView />;
    case "lab":
      return <DesignLab />;
    default:
      return <ComingSoon view={view} />;
  }
}

export function Shell() {
  const { profileId } = useParams({ from: "/p/$profileId" });
  const pathname = useLocation({ select: (s) => s.pathname });
  const navigate = useNavigate();
  const view = viewFromPath(pathname);
  const profile = useProfile(profileId);
  const setTheme = useTheme((s) => s.set);
  const [visited, setVisited] = useState<Set<ViewId>>(() => new Set([view]));

  useEffect(() => {
    startLive();
  }, []);

  useEffect(() => {
    openProfileOnce(profileId).catch(() => {
      toast("That profile doesn't exist anymore.", "warning");
      navigate({ to: "/" });
    });
  }, [profileId, navigate]);

  // Theme and accent follow the profile record, so Settings → Appearance applies everywhere.
  useEffect(() => {
    if (profile) setTheme({ theme: profile.theme, accent: profile.accent });
  }, [profile?.theme, profile?.accent, profile, setTheme]);

  // The UI font comes from the profile's settings.
  const appearance = useSettings().data?.appearance;
  useEffect(() => {
    if (appearance) setTheme({ font: appearance.font, customFont: appearance.customFont });
  }, [appearance, setTheme]);

  useEffect(() => {
    setVisited((v) => (v.has(view) ? v : new Set([...v, view])));
  }, [view]);

  return (
    <div className="flex h-full flex-col bg-bg">
      <motion.div
        initial={{ y: -14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...glide, delay: 0.05 }}
      >
        <Header profile={profile} profileId={profileId} view={view} />
      </motion.div>
      <main className="relative min-h-0 flex-1">
        {KEEP_ALIVE.map((v) =>
          visited.has(v) ? (
            <section key={v} hidden={view !== v} className="absolute inset-0" aria-label={v}>
              {renderView(v)}
            </section>
          ) : null,
        )}
        <AnimatePresence mode="wait" initial={false}>
          {KEEP_ALIVE.includes(view) ? null : (
            <motion.section
              key={view}
              className="absolute inset-0"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.18 }}
              aria-label={view}
            >
              <Suspense fallback={null}>{renderView(view)}</Suspense>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
