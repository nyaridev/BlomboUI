/**
 * Routes. `/` is the profile screen. `/p/$profileId/…` is the app; the Shell stays mounted for
 * every view under a profile and keeps Generate and Gallery alive (hidden) when you switch away.
 */
import { MAIN_VIEWS, MENU_VIEWS, type ViewId } from "@shared/constants";
import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ProfileScreen } from "../features/profiles/ProfileScreen";
import { loadShell } from "./loadShell";

// Its own chunk: the profile screen paints without Generate, Gallery and the prompt editor.
const Shell = lazy(() => loadShell().then((m) => ({ default: m.Shell })));

const DesignLab = lazy(() =>
  import("../features/lab/DesignLab").then((m) => ({ default: m.DesignLab })),
);

const rootRoute = createRootRoute({ component: Outlet });

const profilesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProfileScreen,
});

/** The Design Lab outside any profile (dev and style review). */
const labRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lab",
  component: () => (
    <div className="h-full overflow-auto">
      <Suspense fallback={null}>
        <DesignLab standalone />
      </Suspense>
    </div>
  ),
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$profileId",
  component: () => (
    <Suspense fallback={<div className="h-full bg-bg" />}>
      <Shell />
    </Suspense>
  ),
});
const profileIndexRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: "/",
  component: () => null,
});
const profileViewRoute = createRoute({
  getParentRoute: () => profileRoute,
  path: "$view",
  component: () => null,
});

const routeTree = rootRoute.addChildren([
  profilesRoute,
  labRoute,
  profileRoute.addChildren([profileIndexRoute, profileViewRoute]),
]);

export const router = createRouter({ routeTree, defaultPreload: false });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const VIEWS = new Set<string>([...MAIN_VIEWS, ...MENU_VIEWS]);

export function viewFromPath(pathname: string): ViewId {
  const part = pathname.split("/")[3];
  return part && VIEWS.has(part) ? (part as ViewId) : "generate";
}
