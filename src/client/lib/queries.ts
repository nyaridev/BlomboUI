/** TanStack Query keys and hooks. Server state lives here, never in Zustand. */
import type { BrowseFilter, CivitaiPage } from "@shared/civitai";
import type { ModelKind } from "@shared/constants";
import type { DownloadHistoryPage, EnqueueBody } from "@shared/downloads";
import type { GalleryPage, GalleryQueryInput } from "@shared/gallery";
import type { LocalModel, ModelList } from "@shared/models";
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
  /** Built-in presets, with "installed" flags for the open profile (none open → all false). */
  presets: (profileId: string | null) => ["presets", profileId] as const,
  /** Workflow data belongs to the open profile; the id keeps profiles from sharing a cache. */
  workflows: (profileId: string | null) => ["workflows", profileId] as const,
  workflow: (profileId: string | null, id: string | null) => ["workflow", profileId, id] as const,
  /** Model lists come from ComfyUI and change when it rescans. */
  models: (kind: ModelKind) => ["models", kind] as const,
  modelsAll: ["models"] as const,
  wildcards: (profileId: string | null) => ["wildcards", profileId] as const,
  wildcardTree: (profileId: string | null) => ["wildcard-tree", profileId] as const,
  wildcardFile: (profileId: string | null, path: string | null) =>
    ["wildcard-file", profileId, path] as const,
  settings: (profileId: string | null) => ["settings", profileId] as const,
  /** Everything under ["gallery", profileId] refetches when the index changes. */
  gallery: (profileId: string | null) => ["gallery", profileId] as const,
  galleryOverview: (profileId: string | null) => ["gallery", profileId, "overview"] as const,
  galleryImages: (profileId: string | null, q: GalleryQueryInput) =>
    ["gallery", profileId, "images", q] as const,
  galleryFacets: (profileId: string | null, library: string) =>
    ["gallery", profileId, "facets", library] as const,
  galleryImage: (profileId: string | null, id: number | null) =>
    ["gallery", profileId, "image", id] as const,
  galleryTrash: (profileId: string | null) => ["gallery", profileId, "trash"] as const,
  /** Files in the models folder (not ComfyUI's lists, which are `models`). */
  localModels: (profileId: string | null) => ["local-models", profileId] as const,
  modelDetails: (profileId: string | null, id: string | null) =>
    ["local-models", profileId, "details", id] as const,
  comfySlots: ["comfy-slots"] as const,
  nodeInstall: ["node-install"] as const,
  civitaiAccount: (profileId: string | null) => ["civitai-account", profileId] as const,
  /** Everything under ["civitai", profileId] holds Civitai answers (marks change on downloads). */
  civitai: (profileId: string | null) => ["civitai", profileId] as const,
  civitaiModels: (profileId: string | null, filter: BrowseFilter) =>
    ["civitai", profileId, "models", filter] as const,
  civitaiModel: (profileId: string | null, id: number | null) =>
    ["civitai", profileId, "model", id] as const,
  civitaiViews: (profileId: string | null) => ["civitai", profileId, "views"] as const,
  civitaiSearches: (profileId: string | null) => ["civitai", profileId, "searches"] as const,
  downloadPlan: (profileId: string | null, body: EnqueueBody | null) =>
    ["download-plan", profileId, body] as const,
  downloadHistory: (profileId: string | null) => ["download-history", profileId] as const,
  catalog: (profileId: string | null) => ["catalog", profileId] as const,
  layouts: (profileId: string | null) => ["layouts", profileId] as const,
  /** Stage checks follow the settings being checked (and refetch when models or nodes change). */
  stageReport: (profileId: string | null, workflowId: string | null, stages: unknown) =>
    ["stage-report", profileId, workflowId, stages] as const,
  tagLists: (profileId: string | null) => ["tag-lists", profileId] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

export const useSystem = () => useQuery({ queryKey: qk.system, queryFn: api.system });

export const useProfiles = () => useQuery({ queryKey: qk.profiles, queryFn: api.profiles });

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

export function useTagLists() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.tagLists(profileId),
    queryFn: api.tagLists,
    enabled: profileId !== null,
  });
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
    onSuccess: (saved) => qc.setQueryData(qk.settings(useSession.getState().profileId), saved),
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
    },
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

export function useLocalModels() {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.localModels(profileId),
    queryFn: () => api.localModels(),
    enabled: profileId !== null,
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

export function useCivitaiModel(id: number | null) {
  const profileId = useSession((s) => s.profileId);
  return useQuery({
    queryKey: qk.civitaiModel(profileId, id),
    queryFn: () => api.civitaiModel(id as number),
    enabled: profileId !== null && id !== null,
    staleTime: 5 * 60_000,
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
    },
  });
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
