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
import type { ComfyLogLine, ComfyStatus, FreeMemoryBody } from "@shared/comfy";
import type { ModelKind } from "@shared/constants";
import type { FileInfo } from "@shared/fileinfo";
import type {
  GalleryFacets,
  GalleryOverview,
  GalleryPage,
  GalleryQueryInput,
  ImageDetails,
  SyncState,
  TrashEntry,
} from "@shared/gallery";
import type { InstallBody, InstallState, SlotsResponse } from "@shared/install";
import type { GenerateBody, GenerateResponse, QueueSnapshot } from "@shared/jobs";
import type { LocalModel, ModelDetails, ModelList } from "@shared/models";
import type { CreateProfileBody, Profile, UpdateProfileBody } from "@shared/profile";
import type { LibraryEntry, Settings, SettingsPatch } from "@shared/settings";
import type { RollBody, RollResult, WildcardFile, WildcardTree } from "@shared/wildcards";
import type {
  ImportResult,
  PatchValuesBody,
  PresetSummary,
  UpdateWorkflowBody,
  WorkflowManifest,
  WorkflowSummary,
} from "@shared/workflow/manifest";

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

  comfy: () => request<ComfyStatus>("GET", "/comfy"),
  comfyStart: () => request<ComfyStatus>("POST", "/comfy/start"),
  comfyStop: () => request<ComfyStatus>("POST", "/comfy/stop"),
  comfyRestart: () => request<ComfyStatus>("POST", "/comfy/restart"),
  comfyLogs: () => request<{ lines: ComfyLogLine[] }>("GET", "/comfy/logs"),
  comfyFree: (body: Partial<FreeMemoryBody>) => request<{ ok: true }>("POST", "/comfy/free", body),
  comfyRefresh: () => request<{ ok: true }>("POST", "/comfy/refresh"),
  models: (kind: ModelKind) =>
    request<{ kind: ModelKind; names: string[]; available: boolean }>(
      "GET",
      `/comfy/models/${kind}`,
    ),

  workflows: () => request<WorkflowSummary[]>("GET", "/workflows"),
  workflow: (id: string) => request<WorkflowManifest>("GET", `/workflows/${id}`),
  presets: () => request<PresetSummary[]>("GET", "/workflows/presets"),
  installPreset: (id: string) =>
    request<WorkflowManifest>("POST", `/workflows/presets/${id}/install`),
  importWorkflow: (file: File) =>
    request<ImportResult>(
      "POST",
      `/workflows/import?filename=${encodeURIComponent(file.name)}`,
      undefined,
      file,
    ),
  patchValues: (id: string, body: PatchValuesBody) =>
    request<WorkflowManifest>("PATCH", `/workflows/${id}/values`, body),
  updateWorkflow: (id: string, body: UpdateWorkflowBody) =>
    request<WorkflowManifest>("PATCH", `/workflows/${id}`, body),
  duplicateWorkflow: (id: string, name?: string) =>
    request<WorkflowManifest>("POST", `/workflows/${id}/duplicate`, { name }),
  deleteWorkflow: (id: string) => request<void>("DELETE", `/workflows/${id}`),

  queue: () => request<QueueSnapshot>("GET", "/jobs"),
  generate: (body: GenerateBody) => request<GenerateResponse>("POST", "/jobs", body),
  interrupt: () => request<QueueSnapshot>("POST", "/jobs/interrupt"),
  cancelAll: () => request<QueueSnapshot>("POST", "/jobs/cancel"),
  cancelJob: (id: string) => request<QueueSnapshot>("DELETE", `/jobs/${id}`),
  setLoop: (on: boolean) => request<QueueSnapshot>("PUT", "/jobs/loop", { on }),

  wildcards: () => request<{ root: string; names: string[] }>("GET", "/wildcards"),
  wildcardTree: () => request<WildcardTree>("GET", "/wildcards/tree"),
  wildcardFile: (path: string) =>
    request<WildcardFile>("GET", `/wildcards/file?path=${encodeURIComponent(path)}`),
  saveWildcard: (path: string, text: string, baseMtime: number | null) =>
    request<WildcardFile>("PUT", "/wildcards/file", { path, text, baseMtime }),
  createWildcard: (path: string, type: "file" | "folder") =>
    request<{ ok: true }>("POST", "/wildcards/create", { path, type }),
  moveWildcard: (from: string, to: string) =>
    request<{ ok: true }>("POST", "/wildcards/move", { from, to }),
  trashWildcard: (path: string) => request<{ ok: true }>("POST", "/wildcards/trash", { path }),
  revealWildcard: (path: string) => request<{ ok: true }>("POST", "/wildcards/reveal", { path }),
  rollWildcards: (body: RollBody) => request<RollResult>("POST", "/wildcards/roll", body),

  settings: () => request<Settings>("GET", "/settings"),
  updateSettings: (patch: SettingsPatch) => request<Settings>("PATCH", "/settings", patch),

  galleryOverview: () => request<GalleryOverview>("GET", "/gallery/overview"),
  galleryImages: (q: GalleryQueryInput) =>
    request<GalleryPage>("GET", `/gallery/images?${query(q)}`),
  galleryFacets: (library: string) =>
    request<GalleryFacets>("GET", `/gallery/facets?library=${encodeURIComponent(library)}`),
  galleryImage: (id: number) => request<ImageDetails>("GET", `/gallery/images/${id}`),
  favorite: (ids: number[], favorite: boolean) =>
    request<{ ok: true }>("POST", "/gallery/favorite", { ids, favorite }),
  trashImages: (ids: number[]) =>
    request<{ moved: number; ids: string[] }>("POST", "/gallery/trash", { ids }),
  galleryTrash: () => request<TrashEntry[]>("GET", "/gallery/trash"),
  restoreImages: (ids: string[]) =>
    request<{ restored: number }>("POST", "/gallery/trash/restore", { ids }),
  emptyTrash: (ids?: string[]) =>
    request<{ deleted: number }>("POST", "/gallery/trash/empty", { ids }),
  gallerySync: () => request<SyncState>("POST", "/gallery/sync"),
  revealImage: (id: number) => request<{ ok: true }>("POST", `/gallery/images/${id}/reveal`),
  addLibrary: (name: string, path: string) =>
    request<LibraryEntry>("POST", "/gallery/libraries", { name, path }),
  renameLibrary: (id: string, name: string) =>
    request<{ ok: true }>("PATCH", `/gallery/libraries/${encodeURIComponent(id)}`, { name }),
  removeLibrary: (id: string) =>
    request<void>("DELETE", `/gallery/libraries/${encodeURIComponent(id)}`),

  localModels: (rescan = false) =>
    request<ModelList>("GET", `/models/local${rescan ? "?rescan=1" : ""}`),
  modelDetails: (id: string) =>
    request<ModelDetails>("GET", `/models/local/details?id=${encodeURIComponent(id)}`),
  renameModel: (id: string, name: string) =>
    request<LocalModel>("POST", "/models/rename", { id, name }),
  moveModel: (id: string, folder: string) =>
    request<LocalModel>("POST", "/models/move", { id, folder }),
  revealModel: (id: string) => request<{ ok: true }>("POST", "/models/reveal", { id }),

  fileInfo: (file: Blob, filename: string) =>
    request<FileInfo>(
      "POST",
      `/fileinfo?filename=${encodeURIComponent(filename)}`,
      undefined,
      file,
    ),
  galleryFileInfo: (id: number) => request<FileInfo>("GET", `/fileinfo/gallery/${id}`),
  modelFileInfo: (id: string) =>
    request<FileInfo>("GET", `/fileinfo/model?id=${encodeURIComponent(id)}`),

  comfySlots: () => request<SlotsResponse>("GET", "/comfy/slots"),
  installComfy: (body: InstallBody) => request<InstallState>("POST", "/comfy/install", body),
  cancelInstall: () => request<InstallState>("POST", "/comfy/install/cancel"),
};

/** Query string from defined values only. */
function query(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return q.toString();
}

/** Avatar URL with a cache-buster tied to the profile record, so a new upload shows at once. */
export function avatarUrl(
  profile: Pick<Profile, "id" | "hasAvatar">,
  version?: string,
): string | null {
  return profile.hasAvatar
    ? `/api/profiles/${profile.id}/avatar?v=${encodeURIComponent(version ?? "")}`
    : null;
}
