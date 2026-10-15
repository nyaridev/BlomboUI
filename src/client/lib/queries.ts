/** TanStack Query keys and hooks. Server state lives here, never in Zustand. */
import type { ModelKind } from "@shared/constants";
import type { CreateProfileBody, Profile, UpdateProfileBody } from "@shared/profile";
import type { WorkflowManifest } from "@shared/workflow/manifest";
import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    if (manifest) qc.setQueryData(qk.workflow(profileId, manifest.id), manifest);
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
