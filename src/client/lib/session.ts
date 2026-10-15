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

export function openProfileOnce(id: string): Promise<OpenProfileResponse> {
  if (current?.id === id) return current.request;
  const request = api.openProfile(id);
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

/** Forget the cached open so the next openProfileOnce() asks the server again. */
export function leaveProfile(): void {
  current = null;
  useSession.setState({ profileId: null });
}
