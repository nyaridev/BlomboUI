/** TanStack Query keys and hooks. Server state lives here, never in Zustand. */
import type {
  BrowseFilter,
  CivitaiImagePage,
  CivitaiPage,
  CivitaiPeriod,
  ImageSort,
} from "@shared/civitai";
import type { CompareTask } from "@shared/compare";
import type { ModelKind } from "@shared/constants";
import type { DownloadHistoryPage, EnqueueBody } from "@shared/downloads";
import type {
  AddCivitaiImageBody,
  GalleryPage,
  GalleryQueryInput,
  ImageDetails,
  UseKind,
} from "@shared/gallery";
import type { JobHistoryPage, JobHistoryQueryInput, SaveSnippetBody } from "@shared/history";
import type { LocalModel, ModelList, SaveModelInfoBody } from "@shared/models";
import type { CreateProfileBody, Profile, UpdateProfileBody } from "@shared/profile";
import { deepMerge, type Settings, type SettingsPatch } from "@shared/settings";
import type { WorkflowManifest } from "@shared/workflow/manifest";
import {
  type InfiniteData,
  keepPreviousData,
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api";
import { useSession } from "./session";

export const qk = {
  system: ["system"] as const,
  profiles: ["profiles"] as const,
  /** Under "profiles", so whatever refreshes the list refreshes the numbers too. */
  profileStats: ["profiles", "stats"] as const,
  /** Built-in presets, with "installed" flags for the open profile (none open → all false). */
  presets: (profileId: string | null) => ["presets", profileId] as const,
  /** Workflow data belongs to the open profile; the id keeps profiles from sharing a cache. */
  workflows: (profileId: string | null) => ["workflows", profileId] as const,
  workflow: (profileId: string | null, id: string | null) => ["workflow", profileId, id] as const,
  /** Model lists come from ComfyUI and change when it rescans. */
  models: (kind: ModelKind) => ["models", kind] as const,
  samplers: ["comfy", "samplers"] as const,
  modelsAll: ["models"] as const,
  wildcards: (profileId: string | null) => ["wildcards", profileId] as const,
  wildcardTree: (profileId: string | null) => ["wildcard-tree", profileId] as const,
  wildcardInfo: (profileId: string | null, name: string | null) =>
    ["wildcard-info", profileId, name] as const,
  wildcardFile: (profileId: string | null, path: string | null) =>
    ["wildcard-file", profileId, path] as const,
  settings: (profileId: string | null) => ["settings", profileId] as const,
  /** Everything under ["gallery", profileId] refetches when the index changes. */
  gallery: (profileId: string | null) => ["gallery", profileId] as const,
  galleryOverview: (profileId: string | null) => ["gallery", profileId, "overview"] as const,
  galleryHome: (profileId: string | null) => ["gallery", profileId, "home"] as const,
  devStorage: (profileId: string | null) => ["dev-storage", profileId] as const,
  devImage: (profileId: string | null, id: number | null) => ["dev-image", profileId, id] as const,
  galleryImages: (profileId: string | null, q: GalleryQueryInput) =>
    ["gallery", profileId, "images", q] as const,
  galleryFacets: (profileId: string | null, library: string) =>
    ["gallery", profileId, "facets", library] as const,
  galleryImage: (profileId: string | null, id: number | null) =>
    ["gallery", profileId, "image", id] as const,
  galleryTrash: (profileId: string | null) => ["gallery", profileId, "trash"] as const,
  galleryTags: (profileId: string | null) => ["gallery", profileId, "tags"] as const,
  collections: (profileId: string | null) => ["gallery", profileId, "collections"] as const,
  /** The job log and what's built on it; refetched when runs finish. */
  history: (profileId: string | null) => ["history", profileId] as const,
  jobHistory: (profileId: string | null, q: JobHistoryQueryInput) =>
    ["history", profileId, "jobs", q] as const,
  jobRecord: (profileId: string | null, id: string | null) =>
    ["history", profileId, "job", id] as const,
  promptHistory: (profileId: string | null, q: string) =>
    ["history", profileId, "prompts", q] as const,
  usageStats: (profileId: string | null) => ["history", profileId, "stats"] as const,
  modelMarks: (profileId: string | null) => ["history", profileId, "model-marks"] as const,
  errorLog: (profileId: string | null) => ["error-log", profileId] as const,
  snippets: (profileId: string | null) => ["snippets", profileId] as const,
  compare: (profileId: string | null) => ["compare", profileId] as const,
  /** Files in the models folder (not ComfyUI's lists, which are `models`). */
  localModels: (profileId: string | null) => ["local-models", profileId] as const,
  modelDetails: (profileId: string | null, id: string | null) =>
    ["local-models", profileId, "details", id] as const,
  /** By size and time too: a changed file is hashed again. */
  modelHashes: (profileId: string | null, id: string, version: string) =>
    ["model-hashes", profileId, id, version] as const,
  comfySlots: ["comfy-slots"] as const,
  nodeInstall: ["node-install"] as const,
  civitaiAccount: (profileId: string | null) => ["civitai-account", profileId] as const,
  /** Everything under ["civitai", profileId] holds Civitai answers (marks change on downloads). */
  civitai: (profileId: string | null) => ["civitai", profileId] as const,
  civitaiModels: (profileId: string | null, filter: BrowseFilter) =>
    ["civitai", profileId, "models", filter] as const,
  civitaiCreator: (profileId: string | null, username: string | null) =>
    ["civitai", profileId, "creator", username?.toLowerCase() ?? null] as const,
  civitaiFeed: (profileId: string | null, users: string[], filter: BrowseFilter) =>
    ["civitai", profileId, "feed", users, filter] as const,
  civitaiModel: (profileId: string | null, id: number | null) =>
    ["civitai", profileId, "model", id] as const,
  civitaiVersionImages: (profileId: string | null, id: number | null) =>
    ["civitai", profileId, "version-images", id] as const,
  civitaiCommunityImages: (
    profileId: string | null,
    id: number | null,
    sort: ImageSort,
    period: CivitaiPeriod,
  ) => ["civitai", profileId, "community-images", id, sort, period] as const,
  civitaiByHash: (profileId: string | null, sha256: string | null) =>
    ["civitai", profileId, "by-hash", sha256] as const,
  civitaiViews: (profileId: string | null) => ["civitai", profileId, "views"] as const,
  civitaiSearches: (profileId: string | null) => ["civitai", profileId, "searches"] as const,
  civitaiBaseModels: (profileId: string | null) => ["civitai", profileId, "base-models"] as const,
  downloadPlan: (profileId: string | null, body: EnqueueBody | null) =>
    ["download-plan", profileId, body] as const,
  downloadHistory: (profileId: string | null) => ["download-history", profileId] as const,
  catalog: (profileId: string | null) => ["catalog", profileId] as const,
  catalogDownloads: ["catalog-downloads"] as const,
  layouts: (profileId: string | null) => ["layouts", profileId] as const,
  /** Stage checks follow the settings being checked (and refetch when models or nodes change). */
  stageReport: (profileId: string | null, workflowId: string | null, stages: unknown) =>
    ["stage-report", profileId, workflowId, stages] as const,
  tagLists: (profileId: string | null) => ["tag-lists", profileId] as const,
  tagSources: ["tag-sources"] as const,
  /** Is blombo-bridge loaded in the open profile's ComfyUI (follows ComfyUI's status). */
  bridgeStatus: (profileId: string | null) => ["bridge-status", profileId] as const,
  /** What a batch workflow is missing (refetched when models or custom nodes change). */
  batchCheck: (profileId: string | null, workflowId: string | null) =>
    ["batch-check", profileId, workflowId] as const,
  batch: ["batch"] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

export const useSystem = () => useQuery({ queryKey: qk.system, queryFn: api.system });

export const useProfiles = () => useQuery({ queryKey: qk.profiles, queryFn: api.profiles });

/** Every profile's numbers for the profile screen (they come after the list). */
export const useProfileStats = () =>
  useQuery({ queryKey: qk.profileStats, queryFn: api.profileStats });

export function useProfile(id: string | undefined): Profile | undefined {
  const { data } = useProfiles();
  return data?.profiles.find((p) => p.id === id);
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProfileBody) => api.createProfile(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profiles }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProfileBody }) =>
      api.updateProfile(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profiles }),
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: Blob }) => api.uploadAvatar(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profiles }),
  });
}

export function useRemoveAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeAvatar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profiles }),
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteProfile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profiles }),
  });
}

/* ── workflows ───────────────────────────────────────────────────────────── */

export function useWorkflows() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.workflows(profileId),
    queryFn: api.workflows,
    enabled: profileId !== null,
  });
}

export function useWorkflow(id: string | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.workflow(profileId, id),
    queryFn: () => api.workflow(id as string),
    enabled: profileId !== null && id !== null,
    // Values are edited locally and saved in the background; refetching would fight the editor.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function usePresets() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({ queryKey: qk.presets(profileId), queryFn: api.presets });
}

/** After anything that adds, removes or renames workflows. */
function useWorkflowsChanged() {
  const qc = useQueryClient();
  return (manifest?: WorkflowManifest) => {
    const profileId = useSession.getState().profileId;
    void qc.invalidateQueries({ queryKey: ["workflows"] });
    void qc.invalidateQueries({ queryKey: ["presets"] });
    // The detail adds the layout and live choices: load it fresh.
    if (manifest) void qc.invalidateQueries({ queryKey: qk.workflow(profileId, manifest.id) });
  };
}

export function useInstallPreset() {
  const changed = useWorkflowsChanged();
  return useMutation({ mutationFn: (id: string) => api.installPreset(id), onSuccess: changed });
}

export function useImportWorkflow() {
  const changed = useWorkflowsChanged();
  return useMutation({
    mutationFn: (file: File) => api.importWorkflow(file),
    onSuccess: (r) => changed(r.workflow),
  });
}

export function useDuplicateWorkflow() {
  const changed = useWorkflowsChanged();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) => api.duplicateWorkflow(id, name),
    onSuccess: changed,
  });
}

export function useDeleteWorkflow() {
  const changed = useWorkflowsChanged();
  return useMutation({
    mutationFn: (id: string) => api.deleteWorkflow(id),
    onSuccess: () => changed(),
  });
}

/** Replace a workflow's preview with an image, or clear it ("remove"). */
export function useWorkflowThumb() {
  const changed = useWorkflowsChanged();
  return useMutation({
    mutationFn: ({ id, image }: { id: string; image: Blob | "remove" }) =>
      image === "remove" ? api.removeWorkflowThumb(id) : api.setWorkflowThumb(id, image),
    onSuccess: () => changed(),
  });
}

/* ── layouts, stages, autocomplete ─────────────────────────────────────────── */

export function useLayouts() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.layouts(profileId),
    queryFn: api.layouts,
    enabled: profileId !== null,
    staleTime: 60_000,
  });
}

/** What each stage needs for the active workflow with the given settings (debounced by caller). */
export function useStageReport(workflowId: string | null, stages: unknown) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.stageReport(profileId, workflowId, stages),
    queryFn: () => api.checkStages(workflowId as string, stages),
    enabled: profileId !== null && workflowId !== null,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useBridgeStatus(enabled = true) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.bridgeStatus(profileId),
    queryFn: api.bridgeStatus,
    enabled: enabled && profileId !== null,
    staleTime: 30_000,
  });
}

export function useBatchCheck(workflowId: string | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.batchCheck(profileId, workflowId),
    queryFn: () => api.batchCheck(workflowId as string),
    enabled: profileId !== null && workflowId !== null,
    staleTime: 30_000,
  });
}

/** The batch runner when the view opened; the live bus has it after that. */
export function useBatchSnapshot() {
  return useQuery({ queryKey: qk.batch, queryFn: api.batch });
}

export function useTagLists() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.tagLists(profileId),
    queryFn: api.tagLists,
    enabled: profileId !== null,
  });
}

/** Downloadable tag lists with the date of the file each would fetch (looked up on GitHub). */
export function useTagSources() {
  return useQuery({ queryKey: qk.tagSources, queryFn: api.tagSources, staleTime: 60 * 60_000 });
}

/* ── models and wildcards ────────────────────────────────────────────────── */

export function useModels(kind: ModelKind | null) {
  return useQuery({
    queryKey: qk.models(kind ?? "checkpoints"),
    queryFn: () => api.models(kind as ModelKind),
    enabled: kind !== null,
    staleTime: 5 * 60_000,
  });
}

/** ComfyUI's sampler and scheduler names (Settings → Generate lists them to hide some). */
export function useSamplerLists() {
  return useQuery({ queryKey: qk.samplers, queryFn: api.samplers, staleTime: 5 * 60_000 });
}

export function useWildcards() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.wildcards(profileId),
    queryFn: api.wildcards,
    enabled: profileId !== null,
    staleTime: 60_000,
  });
}

/* ── settings ────────────────────────────────────────────────────────────── */

export function useSettings() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.settings(profileId),
    queryFn: api.settings,
    enabled: profileId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Saves a settings patch; the cache updates at once so the UI follows the click. */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api.updateSettings(patch),
    onMutate: (patch) => {
      const key = qk.settings(useSession.getState().profileId);
      const prev = qc.getQueryData<Settings>(key);
      // Merged the way the server merges (nested objects key by key, arrays replaced).
      if (prev) qc.setQueryData<Settings>(key, deepMerge(prev, patch));
      return { prev, key };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSuccess: (saved, patch) => {
      qc.setQueryData(qk.settings(useSession.getState().profileId), saved);
      // The server filters gallery lists and counts by these.
      if (
        patch.gallery?.excludeGrids !== undefined ||
        patch.gallery?.excludeInterrupted !== undefined
      )
        void qc.invalidateQueries({ queryKey: ["gallery"] });
      // Results, pages and links come from the other Civitai site now.
      if (patch.civitai?.site !== undefined) void qc.invalidateQueries({ queryKey: ["civitai"] });
    },
  });
}

/* ── gallery ─────────────────────────────────────────────────────────────── */

export const GALLERY_PAGE = 300;

export function useGalleryOverview() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.galleryOverview(profileId),
    queryFn: api.galleryOverview,
    enabled: profileId !== null,
  });
}

/** Home: the carousel keeps its order for `seed` through refetches (a new image, a heart). */
export function useGalleryHome(seed: number) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: [...qk.galleryHome(profileId), seed],
    queryFn: () => api.galleryHome(seed),
    enabled: profileId !== null,
    placeholderData: keepPreviousData,
  });
}

/** A Most used view's list; its cards keep their random images for `seed` through refetches. */
export function useGalleryUses(kind: UseKind, seed: number) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: [...qk.gallery(profileId), "uses", kind, seed],
    queryFn: () => api.galleryUses(kind, seed),
    enabled: profileId !== null,
  });
}

/** The Saved data view (dev mode only): what the open profile keeps on disk. */
export function useDevStorage() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.devStorage(profileId),
    queryFn: api.devStorage,
    enabled: profileId !== null,
  });
}

/** The Saved data view: one gallery image's metadata, as written. */
export function useDevImage(id: number | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.devImage(profileId, id),
    queryFn: () => api.devImage(id as number),
    enabled: profileId !== null && id !== null,
  });
}

export function useGalleryImages(q: GalleryQueryInput) {
  const profileId = useSession((s) => s.profileId);
  return useInfiniteQuery({
    queryKey: qk.galleryImages(profileId, q),
    queryFn: ({ pageParam }) => api.galleryImages({ ...q, offset: pageParam, limit: GALLERY_PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last: GalleryPage, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: profileId !== null,
    placeholderData: keepPreviousData,
  });
}

export type GalleryPages = InfiniteData<GalleryPage, number>;

export function useGalleryFacets(library: string) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.galleryFacets(profileId, library),
    queryFn: () => api.galleryFacets(library),
    enabled: profileId !== null,
    staleTime: 60_000,
  });
}

export function useGalleryImage(id: number | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.galleryImage(profileId, id),
    queryFn: () => api.galleryImage(id as number),
    enabled: profileId !== null && id !== null,
    staleTime: 60_000,
  });
}

export function useGalleryTrash(enabled = true) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.galleryTrash(profileId),
    queryFn: api.galleryTrash,
    enabled: enabled && profileId !== null,
  });
}

function useGalleryChanged() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.gallery(useSession.getState().profileId) });
}

export function useFavorite() {
  const qc = useQueryClient();
  const changed = useGalleryChanged();
  return useMutation({
    mutationFn: ({ ids, favorite }: { ids: number[]; favorite: boolean }) =>
      api.favorite(ids, favorite),
    // Flip the hearts in every loaded list right away.
    onMutate: ({ ids, favorite }) => {
      const set = new Set(ids);
      qc.setQueriesData<GalleryPages>(
        { queryKey: [...qk.gallery(useSession.getState().profileId), "images"] },
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              items: p.items.map((i) => (set.has(i.id) ? { ...i, favorite } : i)),
            })),
          },
      );
      qc.setQueriesData<ImageDetails>(
        { queryKey: [...qk.gallery(useSession.getState().profileId), "image"] },
        (old) => (old && set.has(old.id) ? { ...old, favorite } : old),
      );
    },
    // The live bus refreshes the lists once the server has it; a failure puts them back.
    onError: changed,
  });
}

export function useRateImages() {
  const qc = useQueryClient();
  const changed = useGalleryChanged();
  return useMutation({
    mutationFn: ({ ids, rating }: { ids: number[]; rating: number }) => api.rateImages(ids, rating),
    onMutate: ({ ids, rating }) => {
      const set = new Set(ids);
      qc.setQueriesData<GalleryPages>(
        { queryKey: [...qk.gallery(useSession.getState().profileId), "images"] },
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              items: p.items.map((i) => (set.has(i.id) ? { ...i, rating } : i)),
            })),
          },
      );
    },
    // The live bus refreshes the lists once the server has it; a failure puts them back.
    onError: changed,
  });
}

export function useTagImages() {
  const changed = useGalleryChanged();
  return useMutation({
    mutationFn: ({
      ids,
      add = [],
      remove = [],
    }: {
      ids: number[];
      add?: string[];
      remove?: string[];
    }) => api.tagImages(ids, add, remove),
    onSettled: changed,
  });
}

export function useGalleryTags() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.galleryTags(profileId),
    queryFn: api.galleryTags,
    enabled: profileId !== null,
  });
}

export function useCollections() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.collections(profileId),
    queryFn: api.collections,
    enabled: profileId !== null,
  });
}

export function useCollectImages() {
  const changed = useGalleryChanged();
  return useMutation({
    mutationFn: ({ id, ids, remove }: { id: string; ids: number[]; remove?: boolean }) =>
      api.collectImages(id, ids, remove),
    onSettled: changed,
  });
}

export function useTrashImages() {
  const changed = useGalleryChanged();
  return useMutation({ mutationFn: (ids: number[]) => api.trashImages(ids), onSettled: changed });
}

export function useRestoreImages() {
  const changed = useGalleryChanged();
  return useMutation({ mutationFn: (ids: string[]) => api.restoreImages(ids), onSettled: changed });
}

export function useEmptyTrash() {
  const changed = useGalleryChanged();
  return useMutation({ mutationFn: (ids?: string[]) => api.emptyTrash(ids), onSettled: changed });
}

export function useAddLibrary() {
  const qc = useQueryClient();
  const changed = useGalleryChanged();
  return useMutation({
    mutationFn: ({ name, path }: { name: string; path: string }) => api.addLibrary(name, path),
    onSuccess: () => {
      void changed();
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useRemoveLibrary() {
  const qc = useQueryClient();
  const changed = useGalleryChanged();
  return useMutation({
    mutationFn: (id: string) => api.removeLibrary(id),
    onSuccess: () => {
      void changed();
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

/* ── local models ────────────────────────────────────────────────────────── */

export function useLocalModels(enabled = true) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.localModels(profileId),
    queryFn: () => api.localModels(),
    enabled: enabled && profileId !== null,
    staleTime: 5 * 60_000,
  });
}

export function useModelDetails(id: string | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.modelDetails(profileId, id),
    queryFn: () => api.modelDetails(id as string),
    enabled: profileId !== null && id !== null,
  });
}

/** SHA256 and AutoV2 of a local model; the server hashes it when it hasn't yet (big files take a while). */
export function useModelHashes(model: LocalModel | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.modelHashes(profileId, model?.id ?? "", `${model?.size}-${model?.mtime}`),
    queryFn: () => api.modelHashes((model as LocalModel).id),
    enabled: profileId !== null && model !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * The model info dialog's Save: trigger words, strength and notes (only the ones given), then
 * the picture (a new image, or "remove"). The bus refreshes the lists as well.
 */
export function useSaveModelInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      info,
      picture,
    }: {
      info: SaveModelInfoBody | null;
      picture: { id: string; image: Blob | "remove" } | null;
    }) => {
      if (info) await api.saveModelInfo(info);
      if (picture?.image === "remove") await api.removeModelPicture(picture.id);
      else if (picture) await api.setModelPicture(picture.id, picture.image);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["local-models"] });
      void qc.invalidateQueries({ queryKey: qk.modelsAll });
    },
  });
}

/** After a rename or move: swap the model in the cached list at once, then refetch. */
function useModelsChanged() {
  const qc = useQueryClient();
  return (model: LocalModel, oldId: string) => {
    qc.setQueryData<ModelList>(
      qk.localModels(useSession.getState().profileId),
      (old) => old && { ...old, models: old.models.map((m) => (m.id === oldId ? model : m)) },
    );
    void qc.invalidateQueries({ queryKey: ["local-models"] });
    void qc.invalidateQueries({ queryKey: qk.modelsAll });
  };
}

export function useRenameModel() {
  const changed = useModelsChanged();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.renameModel(id, name),
    onSuccess: (model, vars) => changed(model, vars.id),
  });
}

export function useMoveModel() {
  const changed = useModelsChanged();
  return useMutation({
    mutationFn: ({ id, folder }: { id: string; folder: string }) => api.moveModel(id, folder),
    onSuccess: (model, vars) => changed(model, vars.id),
  });
}

/* ── wildcards (manager) ─────────────────────────────────────────────────── */

/** Wildcard info for the pickers; read fresh each time it opens (files change in the editor). */
export function useWildcardInfo(name: string | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.wildcardInfo(profileId, name),
    queryFn: () => api.wildcardInfo(name as string),
    enabled: profileId !== null && name !== null,
    staleTime: 0,
    retry: false,
  });
}

export function useWildcardTree() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.wildcardTree(profileId),
    queryFn: api.wildcardTree,
    enabled: profileId !== null,
  });
}

export function useWildcardFile(path: string | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.wildcardFile(profileId, path),
    queryFn: () => api.wildcardFile(path as string),
    enabled: profileId !== null && path !== null,
    // The editor owns the text once loaded; a refetch would fight it.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** After creating, moving or trashing wildcard files. */
export function useWildcardsChanged() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["wildcard-tree"] });
    void qc.invalidateQueries({ queryKey: ["wildcards"] });
  };
}

/* ── ComfyUI slots ───────────────────────────────────────────────────────── */

export function useComfySlots() {
  return useQuery({ queryKey: qk.comfySlots, queryFn: api.comfySlots });
}

/** The custom node installer's state when the view opened; the live bus has it after that. */
export function useNodeInstall() {
  return useQuery({ queryKey: qk.nodeInstall, queryFn: api.nodeInstall });
}

/* ── Civitai ─────────────────────────────────────────────────────────────── */

export function useCivitaiAccount() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.civitaiAccount(profileId),
    queryFn: api.civitaiAccount,
    enabled: profileId !== null,
  });
}

export function useCivitaiModels(filter: BrowseFilter | null) {
  const profileId = useSession((s) => s.profileId);
  return useInfiniteQuery({
    queryKey: qk.civitaiModels(profileId, filter as BrowseFilter),
    queryFn: ({ pageParam }) => api.civitaiModels(filter as BrowseFilter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: CivitaiPage) => last.nextCursor,
    enabled: profileId !== null && filter !== null,
    // The server caches Civitai's answers; browsing back to a filter is instant.
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * The Following feed: the creators' newest models with the filter (one page; same shape as
 * `useCivitaiModels`, so the browser's grid shows either).
 */
export function useCivitaiFeed(users: string[], filter: BrowseFilter | null) {
  const profileId = useSession((s) => s.profileId);
  return useInfiniteQuery({
    queryKey: qk.civitaiFeed(profileId, users, filter as BrowseFilter),
    queryFn: () => api.civitaiFeed(users, filter as BrowseFilter),
    initialPageParam: null as string | null,
    getNextPageParam: (last: CivitaiPage) => last.nextCursor,
    enabled: profileId !== null && filter !== null && users.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * A creator's name as Civitai spells it and their picture (null: no models by that name), asked
 * once per session. When they're followed, the server saves the answer with them, so the
 * settings are read again.
 */
export function useCivitaiCreator(username: string | null) {
  const profileId = useSession((s) => s.profileId);
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.civitaiCreator(profileId, username),
    queryFn: async () => {
      const found = await api.lookupCivitaiCreator(username ?? "");
      const followed = qc
        .getQueryData<Settings>(qk.settings(profileId))
        ?.civitai.following.some((f) => f.username.toLowerCase() === username?.toLowerCase());
      if (found && followed) void qc.invalidateQueries({ queryKey: qk.settings(profileId) });
      return found;
    },
    enabled: profileId !== null && Boolean(username),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

/** The Civitai model a file belongs to, by its SHA256 (null when Civitai doesn't know it). */
export function useCivitaiByHash(sha256: string | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.civitaiByHash(profileId, sha256),
    queryFn: () => api.civitaiByHash(sha256 as string),
    enabled: profileId !== null && sha256 !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useCivitaiModel(id: number | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.civitaiModel(profileId, id),
    queryFn: () => api.civitaiModel(id as number),
    enabled: profileId !== null && id !== null,
    staleTime: 5 * 60_000,
  });
}

/** A version's images with who posted them and how they were made (the model answer's lack it). */
export function useCivitaiVersionImages(id: number | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.civitaiVersionImages(profileId, id),
    queryFn: () => api.civitaiVersionImages(id as number),
    enabled: profileId !== null && id !== null,
    staleTime: 5 * 60_000,
  });
}

/** Images people posted with a version, in an order and period, a page at a time. */
export function useCivitaiCommunityImages(
  id: number | null,
  sort: ImageSort,
  period: CivitaiPeriod,
) {
  const profileId = useSession((s) => s.profileId);
  return useInfiniteQuery({
    queryKey: qk.civitaiCommunityImages(profileId, id, sort, period),
    queryFn: ({ pageParam }) =>
      api.civitaiCommunityImages(id as number, { sort, period, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: CivitaiImagePage) => last.nextCursor,
    enabled: profileId !== null && id !== null,
    staleTime: 5 * 60_000,
    // Another order or period keeps the old images up until the new ones land: nothing collapses.
    placeholderData: keepPreviousData,
  });
}

export function useCivitaiViews(enabled = true) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.civitaiViews(profileId),
    queryFn: api.civitaiViews,
    enabled: enabled && profileId !== null,
  });
}

export function useCivitaiSearches() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.civitaiSearches(profileId),
    queryFn: api.civitaiSearches,
    enabled: profileId !== null,
  });
}

/** The base models Civitai's filter offers (the server asks once a day). */
export function useCivitaiBaseModels() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.civitaiBaseModels(profileId),
    queryFn: api.civitaiBaseModels,
    enabled: profileId !== null,
    staleTime: 60 * 60_000,
  });
}

/* ── downloads ───────────────────────────────────────────────────────────── */

/** Where a download would land (the preview under the Download button). */
export function useDownloadPlan(body: EnqueueBody | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.downloadPlan(profileId, body),
    queryFn: () => api.planDownload(body as EnqueueBody),
    enabled: profileId !== null && body !== null,
    staleTime: 15_000,
    retry: false,
    // Typing a folder or name keeps the last plan on screen until the new one arrives.
    placeholderData: keepPreviousData,
  });
}

/** Start a download; the queue itself comes over the live bus. */
export function useStartDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EnqueueBody) => api.download(body),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["download-plan"] });
      void qc.invalidateQueries({ queryKey: ["download-history"] });
      // A first download from an author saves their file-name prefix into the settings.
      void qc.invalidateQueries({ queryKey: qk.settings(useSession.getState().profileId) });
    },
  });
}

/** Add a Civitai image to the gallery (the live bus brings the new image to the lists). */
export function useAddCivitaiImage() {
  return useMutation({ mutationFn: (body: AddCivitaiImageBody) => api.addCivitaiImage(body) });
}

/** Add an image file from your PC to the gallery. */
export function useAddImageFile() {
  return useMutation({ mutationFn: (file: File) => api.addImageFile(file, file.name) });
}

export const HISTORY_PAGE = 100;

export function useDownloadHistory(enabled = true) {
  const profileId = useSession((s) => s.profileId);
  return useInfiniteQuery({
    queryKey: qk.downloadHistory(profileId),
    queryFn: ({ pageParam }) => api.downloadHistory(pageParam, HISTORY_PAGE),
    initialPageParam: 0,
    getNextPageParam: (last: DownloadHistoryPage, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: enabled && profileId !== null,
  });
}

/* ── Manager store ───────────────────────────────────────────────────────── */

export function useCatalog() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.catalog(profileId),
    queryFn: () => api.catalog(),
    enabled: profileId !== null,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** The catalog's Hugging Face download counts (the same for every profile; a day old at most). */
export function useCatalogDownloads(enabled: boolean) {
  return useQuery({
    queryKey: qk.catalogDownloads,
    queryFn: () => api.catalogDownloads(),
    enabled,
    staleTime: 60 * 60_000,
    retry: false,
  });
}

/* ── history (job log, prompts, stats, errors, snippets) ────────────────── */

export const HISTORY_JOBS_PAGE = 100;

export function useJobHistory(q: JobHistoryQueryInput, enabled = true) {
  const profileId = useSession((s) => s.profileId);
  return useInfiniteQuery({
    queryKey: qk.jobHistory(profileId, q),
    queryFn: ({ pageParam }) =>
      api.jobHistory({ ...q, offset: pageParam, limit: HISTORY_JOBS_PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last: JobHistoryPage, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: enabled && profileId !== null,
    placeholderData: keepPreviousData,
  });
}

export function useJobRecord(id: string | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.jobRecord(profileId, id),
    queryFn: () => api.jobRecord(id as string),
    enabled: profileId !== null && id !== null,
    // Switching between results keeps the last run's info until the next arrives (no jump).
    placeholderData: keepPreviousData,
  });
}

export function usePromptHistory(q: string, enabled = true) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.promptHistory(profileId, q),
    queryFn: () => api.promptHistory(q, 60),
    enabled: enabled && profileId !== null,
    placeholderData: keepPreviousData,
  });
}

export function useUsageStats() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.usageStats(profileId),
    queryFn: api.usageStats,
    enabled: profileId !== null,
  });
}

export function useModelMarks() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.modelMarks(profileId),
    queryFn: api.modelMarks,
    enabled: profileId !== null,
    staleTime: 60_000,
  });
}

export function useSetModelFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      name,
      favorite,
    }: {
      kind: ModelKind | "wildcards";
      name: string;
      favorite: boolean;
    }) => api.setModelFavorite(kind, name, favorite),
    onSuccess: (marks) => qc.setQueryData(qk.modelMarks(useSession.getState().profileId), marks),
  });
}

export function useErrorLog() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.errorLog(profileId),
    queryFn: api.errorLog,
    enabled: profileId !== null,
  });
}

export function useSnippets(enabled = true) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.snippets(profileId),
    queryFn: api.snippets,
    enabled: enabled && profileId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useSaveSnippet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveSnippetBody) => api.saveSnippet(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snippets"] }),
  });
}

export function useRemoveSnippet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeSnippet(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["snippets"] }),
  });
}

/* ── compare ──────────────────────────────────────────────────────────── */

/**
 * The profile's comparisons, newest change first. The live bus keeps them current while a view
 * follows the "compare" topic.
 */
export function useCompareTasks() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.compare(profileId),
    queryFn: api.compareTasks,
    enabled: profileId !== null,
  });
}

/** Put a comparison the server answered with into the list (the bus says it too, maybe later). */
export function putCompare(task: CompareTask): void {
  const profileId = useSession.getState().profileId;
  queryClient.setQueryData<CompareTask[]>(qk.compare(profileId), (old) =>
    old ? [task, ...old.filter((t) => t.id !== task.id)] : old,
  );
}
