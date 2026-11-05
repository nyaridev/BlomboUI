/**
 * HTTP response shapes shared by the server routes and the client API wrapper.
 * Request bodies live next to their domain (profile.ts, workflow/…) as Zod schemas.
 */
import type { ClockFormat } from "./clock.ts";
import type { CheckPathResult, Profile, ProfileRegistry, ProfileStats } from "./profile.ts";

export interface SystemInfo {
  app: string;
  version: string;
  dev: boolean;
  platform: NodeJS.Platform | string;
  dataDir: string;
  activeProfileId: string | null;
  /** How the OS shows the time of day (Windows' short time); null: the page's language decides. */
  clock: ClockFormat | null;
}

export interface ProfilesResponse {
  registry: ProfileRegistry;
  profiles: Profile[];
  activeId: string | null;
}

/** Profile id → its numbers (`GET /api/profiles/stats`). */
export type ProfileStatsResponse = Record<string, ProfileStats>;

export interface OpenProfileResponse {
  profile: Profile;
  /** True when ComfyUI must restart because the models folder changed. */
  comfyRestart: boolean;
}

export type { CheckPathResult };

export interface ApiErrorBody {
  error: string;
  /** Machine-readable code for branching in the UI. */
  code?: string;
  details?: unknown;
}
