/**
 * The open profile, from the client's side. Opening is idempotent per id: the profile screen,
 * a reload on /p/:id and React StrictMode all share one request instead of racing.
 */
import type { OpenProfileResponse } from "@shared/api";
import { api } from "./api";

let current: { id: string; request: Promise<OpenProfileResponse> } | null = null;

export function openProfileOnce(id: string): Promise<OpenProfileResponse> {
  if (current?.id === id) return current.request;
  const request = api.openProfile(id);
  current = { id, request };
  request.catch(() => {
    if (current?.request === request) current = null;
  });
  return request;
}

/** Forget the cached open so the next openProfileOnce() asks the server again. */
export function leaveProfile(): void {
  current = null;
}
