/**
 * The open profile, from the client's side. Opening is idempotent per id: the profile screen,
 * a reload on /p/:id and React StrictMode all share one request instead of racing.
 * `useSession` says which profile the server has open, so profile-scoped queries (workflows,
 * wildcards) only run once it's ready and are keyed by it.
 */
import type { OpenProfileResponse } from "@shared/api";
import { create } from "zustand";
import { api } from "./api";

export const useSession = create<{ profileId: string | null }>(() => ({ profileId: null }));

let current: { id: string; request: Promise<OpenProfileResponse> } | null = null;

/**
 * Work to finish before the server switches profiles: saves still queued for the old one (the
 * value PATCH has no profile in it, so it would land in the new one) and per-profile UI state
 * keyed only by ids that both profiles can have (built-in presets share their ids).
 */
const beforeSwitch: Array<() => Promise<void> | void> = [];
export function onProfileSwitch(fn: () => Promise<void> | void): void {
  beforeSwitch.push(fn);
}
let switching: Promise<void> = Promise.resolve();
function runSwitch(): Promise<void> {
  switching = switching.then(async () => {
    for (const fn of beforeSwitch) await Promise.resolve(fn()).catch(() => undefined);
  });
  return switching;
}

export function openProfileOnce(id: string): Promise<OpenProfileResponse> {
  if (current?.id === id) return current.request;
  const request = runSwitch().then(() => api.openProfile(id));
  current = { id, request };
  useSession.setState({ profileId: null });
  request.then(
    () => {
      if (current?.request === request) useSession.setState({ profileId: id });
    },
    () => {
      if (current?.request === request) current = null;
    },
  );
  return request;
}

/**
 * The server came back without this window's profile open (it restarted): open it again, so
 * profile requests don't fail with "Open a profile first".
 */
export function reopenProfile(id: string): void {
  if (current?.id !== id) return;
  current = null;
  void openProfileOnce(id).catch(() => undefined);
}

/** Forget the cached open so the next openProfileOnce() asks the server again. */
export function leaveProfile(): void {
  current = null;
  useSession.setState({ profileId: null });
  void runSwitch();
}
