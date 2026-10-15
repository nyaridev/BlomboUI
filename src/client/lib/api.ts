/**
 * Typed fetch wrapper for /api. Errors come back as ApiError with the server's message and
 * code, so the UI can show "what went wrong and what to do" instead of a status number.
 */
import type {
  ApiErrorBody,
  CheckPathResult,
  OpenProfileResponse,
  ProfilesResponse,
  SystemInfo,
} from "@shared/api";
import type { CreateProfileBody, Profile, UpdateProfileBody } from "@shared/profile";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  raw?: BodyInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, "Can't reach the BlomboUI server. Is it still running?", "offline");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, err.error ?? `Request failed (${res.status})`, err.code);
  }
  return data as T;
}

export const api = {
  system: () => request<SystemInfo>("GET", "/system"),
  checkPath: (path: string) => request<CheckPathResult>("POST", "/system/check-path", { path }),
  pickFolder: (title: string, initial?: string) =>
    request<{ path: string | null }>("POST", "/system/pick-folder", { title, initial }),

  profiles: () => request<ProfilesResponse>("GET", "/profiles"),
  createProfile: (body: CreateProfileBody) => request<Profile>("POST", "/profiles", body),
  updateProfile: (id: string, body: UpdateProfileBody) =>
    request<Profile>("PATCH", `/profiles/${id}`, body),
  deleteProfile: (id: string) => request<void>("DELETE", `/profiles/${id}`),
  openProfile: (id: string) => request<OpenProfileResponse>("POST", `/profiles/${id}/open`),
  setOpenOnLaunch: (id: string | null) =>
    request<unknown>("PUT", "/profiles/open-on-launch", { id }),
  uploadAvatar: (id: string, file: Blob) =>
    request<Profile>("PUT", `/profiles/${id}/avatar`, undefined, file),
  removeAvatar: (id: string) => request<Profile>("DELETE", `/profiles/${id}/avatar`),
};

/** Avatar URL with a cache-buster tied to the profile record, so a new upload shows at once. */
export function avatarUrl(
  profile: Pick<Profile, "id" | "hasAvatar">,
  version?: string,
): string | null {
  return profile.hasAvatar
    ? `/api/profiles/${profile.id}/avatar?v=${encodeURIComponent(version ?? "")}`
    : null;
}
