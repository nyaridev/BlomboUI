/** Pieces the Settings pages share: the page header, sections and the open profile. */
import type { IconName } from "@client/icons/Icon";
import { useProfile } from "@client/lib/queries";
import { Panel, SectionTitle } from "@client/ui";
import { useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function PageHeader({ title }: { title: string }) {
  return (
    <h1 className="mb-6 text-2xl font-semibold tracking-tight text-balance text-fg">{title}</h1>
  );
}

/**
 * A titled group of settings: a caps title (icon, optional actions on the right) over a card.
 * Each child is one row of the card, padded and split from the next by a line.
 */
export function SettingsSection({
  title,
  icon,
  actions,
  children,
}: {
  title: string;
  icon: IconName;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle icon={icon} actions={actions} className="min-h-7 px-1">
        {title}
      </SectionTitle>
      <Panel className="flex flex-col divide-y divide-line *:px-4 *:py-4 max-lg:*:px-3">
        {children}
      </Panel>
    </section>
  );
}

export function useCurrentProfile() {
  const { profileId } = useParams({ strict: false }) as { profileId?: string };
  return useProfile(profileId);
}
