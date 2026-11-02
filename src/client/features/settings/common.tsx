/** Pieces the Settings pages share: the page header and the open profile. */
import { useProfile } from "@client/lib/queries";
import { useParams } from "@tanstack/react-router";

export function PageHeader({ title }: { title: string }) {
  return (
    <h1 className="mb-6 text-2xl font-semibold tracking-tight text-balance text-fg">{title}</h1>
  );
}

export function useCurrentProfile() {
  const { profileId } = useParams({ strict: false }) as { profileId?: string };
  return useProfile(profileId);
}
