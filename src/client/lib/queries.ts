/** TanStack Query keys and hooks. Server state lives here, never in Zustand. */
import type { CreateProfileBody, Profile, UpdateProfileBody } from "@shared/profile";
import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export const qk = {
  system: ["system"] as const,
  profiles: ["profiles"] as const,
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
