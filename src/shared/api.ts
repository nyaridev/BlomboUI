/**
 * HTTP response shapes shared by the server routes and the client API wrapper.
 * Request bodies live next to their domain (profile.ts, workflow/…) as Zod schemas.
 */
import type { CheckPathResult, Profile, ProfileRegistry } from "./profile.ts";

export interface SystemInfo {
  app: string;
  version: string;
  dev: boolean;
  platform: NodeJS.Platform | string;
  dataDir: string;
  activeProfileId: string | null;
}

export interface ProfilesResponse {
  registry: ProfileRegistry;
  profiles: Profile[];
  activeId: string | null;
}

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
