/**
 * Routes. `/` is the profile screen. `/p/$profileId/…` is the app; the Shell stays mounted for
 * every view under a profile and keeps Generate and Gallery alive (hidden) when you switch away.
 */
import { MAIN_VIEWS, MENU_VIEWS, type ViewId } from "@shared/constants";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ProfileScreen } from "../features/profiles/ProfileScreen";
import { loadShell } from "./loadShell";

// Its own chunk: the profile screen paints without Generate, Gallery and the prompt editor.
const Shell = lazy(() => loadShell().then((m) => ({ default: m.Shell })));

// Dev mode only, so the built app doesn't ship the Lab at all.
const DesignLab = import.meta.env.DEV
  ? lazy(() => import("../features/lab/DesignLab").then((m) => ({ default: m.DesignLab })))
  : () => null;

// Dev mode only: the floating layout-variant switcher (lib/variants.ts).
const VariantPanel = import.meta.env.DEV
  ? lazy(() => import("../features/dev/VariantPanel").then((m) => ({ default: m.VariantPanel })))
  : () => null;

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Suspense fallback={null}>
        <VariantPanel />
      </Suspense>
    </>
  ),
});

const profilesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProfileScreen,
});

/** The Design Lab outside any profile. Dev mode only; the built app sends /lab home. */
const labRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lab",
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw redirect({ to: "/" });
  },
  component: () => (
    <Suspense fallback={null}>
      <DesignLab standalone />
    </Suspense>
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
  if (part === "lab" && !import.meta.env.DEV) return "generate";
  return part && VIEWS.has(part) ? (part as ViewId) : "generate";
}
