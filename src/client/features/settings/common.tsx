/** Pieces the Settings pages share: the page header and a settings row link. */
import { Icon, type IconName } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useProfile } from "@client/lib/queries";
import { useParams } from "@tanstack/react-router";

export function PageHeader({ title, text }: { title: string; text?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight text-balance text-fg">{title}</h1>
      {text ? <p className="text-sm text-fg-3">{text}</p> : null}
    </div>
  );
}

export function useCurrentProfile() {
  const { profileId } = useParams({ strict: false }) as { profileId?: string };
  return useProfile(profileId);
}

/** A row that opens another page or view. */
export function QuickRow({
  icon,
  title,
  text,
  onClick,
  warn,
}: {
  icon: IconName;
  title: string;
  text: string;
  onClick: () => void;
  warn?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3.5 px-4 py-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-field focus-ring"
    >
      <span className="grid h-8 w-8 place-items-center rounded-md bg-field text-fg-2">
        <Icon name={icon} size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-fg">{title}</span>
        <span className={cn("truncate text-xs", warn ? "text-warning" : "text-fg-3")}>{text}</span>
      </span>
      <Icon name="chevron-right" size={15} className="text-fg-3" />
    </button>
  );
}
