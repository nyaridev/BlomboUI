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
import type { CompleteMode, Suggestion, TagListInfo, TagListsResponse } from "@shared/autocomplete";
import type {
  BatchCheck,
  BatchRun,
  BatchSnapshot,
  StagedFile,
  StartBatchBody,
} from "@shared/batch";
import type { BridgeStatus, EditSession } from "@shared/bridge";
import {
  type BrowseFilter,
  browseQuery,
  type CivitaiAccount,
  type CivitaiModel,
  type CivitaiPage,
  type CivitaiSearch,
  type CivitaiView,
} from "@shared/civitai";
import type { ComfyFileRef, ComfyLogLine, ComfyStatus, FreeMemoryBody } from "@shared/comfy";
import type { ModelKind } from "@shared/constants";
import type {
  Download,
  DownloadHistoryPage,
  DownloadPlan,
  DownloadsSnapshot,
  EnqueueBody,
} from "@shared/downloads";
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
import type { InstallBody, InstallState, NodeInstallState, SlotsResponse } from "@shared/install";
import type { GenerateBody, GenerateResponse, QueueSnapshot } from "@shared/jobs";
import type { CreateLayoutBody, LayoutDocument, LayoutList } from "@shared/layout/schema";
import type { Catalog } from "@shared/manager";
import type { LocalModel, LookupState, ModelDetails, ModelList } from "@shared/models";
import type { CreateProfileBody, Profile, UpdateProfileBody } from "@shared/profile";
import type { LibraryEntry, Settings, SettingsPatch } from "@shared/settings";
import type { RollBody, RollResult, WildcardFile, WildcardTree } from "@shared/wildcards";
import type {
  ImportResult,
  PatchValuesBody,
  PresetSummary,
  UpdateWorkflowBody,
  WorkflowDetail,
  WorkflowManifest,
  WorkflowSummary,
} from "@shared/workflow/manifest";
import type { StageImage, StageReport } from "@shared/workflow/stages";

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
  pickImages: (title: string) =>
    request<{ paths: string[] }>("POST", "/system/pick-images", { title }),

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
  workflow: (id: string) => request<WorkflowDetail>("GET", `/workflows/${id}`),
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
  /** Edit in ComfyUI: a single-use token and the ComfyUI address that opens it. */
  editSession: (id: string) => request<EditSession>("POST", `/workflows/${id}/edit-session`),
  bridgeStatus: () => request<BridgeStatus>("GET", "/comfy/bridge"),
  installBridge: (folder: string) =>
    request<{ path: string; result: string }>("POST", "/comfy/bridge/install", { folder }),

  batch: () => request<BatchSnapshot>("GET", "/batch"),
  batchCheck: (workflowId: string) =>
    request<BatchCheck>("GET", `/batch/check/${encodeURIComponent(workflowId)}`),
  startBatch: (body: StartBatchBody) => request<BatchRun>("POST", "/batch", body),
  cancelBatch: () => request<BatchSnapshot>("POST", "/batch/cancel"),
  clearBatch: () => request<BatchSnapshot>("POST", "/batch/clear"),
  stageBatchFile: (file: File) =>
    request<StagedFile>(
      "POST",
      `/batch/files?filename=${encodeURIComponent(file.name)}`,
      undefined,
      file,
    ),

  layouts: () => request<LayoutList>("GET", "/layouts"),
  createLayout: (body: CreateLayoutBody) => request<LayoutDocument>("POST", "/layouts", body),
  saveLayout: (id: string, doc: LayoutDocument) =>
    request<LayoutDocument>("PUT", `/layouts/${encodeURIComponent(id)}`, { doc }),
  renameLayout: (id: string, name: string) =>
    request<LayoutDocument>("PATCH", `/layouts/${encodeURIComponent(id)}`, { name }),
  deleteLayout: (id: string) => request<void>("DELETE", `/layouts/${encodeURIComponent(id)}`),

  checkStages: (workflowId: string, stages: unknown) =>
    request<StageReport>("POST", "/stages/check", { workflowId, stages }),
  uploadStageImage: (file: Blob, filename: string) =>
    request<StageImage>(
      "POST",
      `/stages/images?filename=${encodeURIComponent(filename)}`,
      undefined,
      file,
    ),
  stageImageFromGallery: (id: number) =>
    request<StageImage>("POST", "/stages/images/gallery", { id }),
  stageImageFromOutput: (ref: ComfyFileRef) =>
    request<StageImage>("POST", "/stages/images/output", ref),
  previewMap: (file: string, preprocessor: string, resolution: number) =>
    request<ComfyFileRef>("POST", "/stages/preview", { file, preprocessor, resolution }),

  suggest: (q: string, mode: CompleteMode, limit: number, signal?: AbortSignal) =>
    fetch(`/api/autocomplete?${query({ q, mode, limit })}`, { signal }).then((r) =>
      r.ok ? (r.json() as Promise<Suggestion[]>) : ([] as Suggestion[]),
    ),
  tagLists: () => request<TagListsResponse>("GET", "/autocomplete/lists"),
  addTagList: (file: File) =>
    request<TagListInfo>(
      "POST",
      `/autocomplete/lists?filename=${encodeURIComponent(file.name)}`,
      undefined,
      file,
    ),
  removeTagList: (file: string) =>
    request<void>("DELETE", `/autocomplete/lists/${encodeURIComponent(file)}`),
  revealTagLists: () => request<{ ok: true }>("POST", "/autocomplete/lists/reveal"),
  clearFrequentTags: () => request<void>("DELETE", "/autocomplete/frequent"),

  queue: () => request<QueueSnapshot>("GET", "/jobs"),
  generate: (body: GenerateBody) => request<GenerateResponse>("POST", "/jobs", body),
  interrupt: () => request<QueueSnapshot>("POST", "/jobs/interrupt"),
  cancelAll: () => request<QueueSnapshot>("POST", "/jobs/cancel"),
  cancelJob: (id: string) => request<QueueSnapshot>("DELETE", `/jobs/${id}`),
  setLoop: (on: boolean) => request<QueueSnapshot>("PUT", "/jobs/loop", { on }),
  cancelGroup: (id: string) =>
    request<QueueSnapshot>("POST", `/jobs/groups/${encodeURIComponent(id)}/cancel`),

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

  modelLookup: () => request<LookupState>("GET", "/models/lookup"),
  startModelLookup: () => request<LookupState>("POST", "/models/lookup"),

  civitaiAccount: () => request<CivitaiAccount>("GET", "/civitai/account"),
  setCivitaiKey: (key: string, check = true) =>
    request<CivitaiAccount>("PUT", "/civitai/account/key", { key, check }),
  removeCivitaiKey: () => request<CivitaiAccount>("DELETE", "/civitai/account/key"),
  civitaiModels: (filter: BrowseFilter, cursor: string | null) =>
    request<CivitaiPage>("GET", `/civitai/models?${browseQuery(filter, cursor)}`),
  civitaiModel: (id: number) => request<CivitaiModel>("GET", `/civitai/models/${id}`),
  civitaiViews: () => request<CivitaiView[]>("GET", "/civitai/history/views"),
  clearCivitaiViews: () => request<{ ok: true }>("DELETE", "/civitai/history/views"),
  civitaiSearches: () => request<CivitaiSearch[]>("GET", "/civitai/history/searches"),
  forgetCivitaiSearch: (q?: string) =>
    request<{ ok: true }>(
      "DELETE",
      `/civitai/history/searches${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`,
    ),

  downloads: () => request<DownloadsSnapshot>("GET", "/downloads"),
  planDownload: (body: EnqueueBody) => request<DownloadPlan>("POST", "/downloads/plan", body),
  download: (body: EnqueueBody) => request<Download>("POST", "/downloads", body),
  pauseDownload: (id: string) => request<Download>("POST", `/downloads/${id}/pause`),
  resumeDownload: (id: string) => request<Download>("POST", `/downloads/${id}/resume`),
  cancelDownload: (id: string) => request<Download>("POST", `/downloads/${id}/cancel`),
  clearDownloads: () => request<DownloadsSnapshot>("POST", "/downloads/clear"),
  revealDownload: (id: string) => request<{ ok: true }>("POST", `/downloads/${id}/reveal`),
  downloadHistory: (offset: number, limit: number) =>
    request<DownloadHistoryPage>("GET", `/downloads/history?offset=${offset}&limit=${limit}`),
  clearDownloadHistory: () => request<{ ok: true }>("DELETE", "/downloads/history"),

  catalog: (refresh = false) =>
    request<Catalog>("GET", `/manager/catalog${refresh ? "?refresh=1" : ""}`),

  comfySlots: () => request<SlotsResponse>("GET", "/comfy/slots"),
  installComfy: (body: InstallBody) => request<InstallState>("POST", "/comfy/install", body),
  cancelInstall: () => request<InstallState>("POST", "/comfy/install/cancel"),
  nodeInstall: () => request<NodeInstallState>("GET", "/comfy/nodes"),
  /** Install stage custom node packs (by repository URL) into the managed slot. */
  installNodes: (packs: string[]) =>
    request<NodeInstallState>("POST", "/comfy/nodes/install", { packs }),
  cancelNodeInstall: () => request<NodeInstallState>("POST", "/comfy/nodes/cancel"),
};

/** Query string from defined values only. */
function query(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return q.toString();
}

/** The .blombo download of a workflow. */
export function workflowExportUrl(id: string): string {
  return `/api/workflows/${encodeURIComponent(id)}/export`;
}

/** A stage's control image (named by its content, so it's cached for good). */
export function stageImageUrl(file: string): string {
  return `/api/stages/images/${encodeURIComponent(file)}`;
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
