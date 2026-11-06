/** Small pieces the Saved data view's sections share: a section frame, a group heading, code. */
import { Icon, type IconName } from "@client/icons/Icon";
import { CopyButton } from "@client/ui";
import type { ReactNode } from "react";

export function Section({
  id,
  title,
  text,
  children,
}: {
  id: string;
  title: string;
  text: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={`saved-${id}`} className="flex scroll-mt-16 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-balance text-fg">{title}</h2>
        <p className="max-w-[70ch] text-sm text-fg-3">{text}</p>
      </div>
      {children}
    </section>
  );
}

/** A group's heading inside a section: icon tile, title, what it is, and a figure on the right. */
export function GroupHeading({
  icon,
  title,
  text,
  aside,
}: {
  icon: IconName;
  title: string;
  text: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-field text-accent-ink">
        <Icon name={icon} size={15} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-fg">{title}</span>
        <span className="text-xs text-fg-3">{text}</span>
      </div>
      {aside ? <span className="shrink-0 pt-0.5 text-xs text-fg-3 tabular">{aside}</span> : null}
    </div>
  );
}

export function Code({ text, label }: { text: string; label?: string }) {
  return (
    <div className="relative">
      <CopyButton
        text={text}
        label={`Copy ${label ?? "text"}`}
        className="absolute top-1.5 right-1.5"
      />
      <pre className="max-h-96 overflow-auto rounded-md border border-line bg-sunken p-2.5 pr-10 font-mono text-2xs leading-relaxed break-all whitespace-pre-wrap text-fg-2">
        {text}
      </pre>
    </div>
  );
}

/** A value from saved data, short enough for a table cell. */
export function shortValue(v: unknown, max = 80): string {
  const text = typeof v === "string" ? v : JSON.stringify(v);
  if (text === undefined) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
