/** Small pieces File Info's panels share: a grid of facts, a text block with copy, sections. */
import type { IconName } from "@client/icons/Icon";
import { Badge, Collapsible, CopyButton, SectionTitle } from "@client/ui";
import type { ReactNode } from "react";

export interface Fact {
  label: string;
  value: ReactNode;
  /** Text for a copy button next to the value. */
  copy?: string;
  mono?: boolean;
  /** Spans the whole row (long values: hashes, paths). */
  wide?: boolean;
}

/** Label-over-value cells in a grid; empty values are left out. */
export function Facts({ items, columns = 4 }: { items: Fact[]; columns?: 3 | 4 }) {
  const shown = items.filter((f) => f.value !== null && f.value !== undefined && f.value !== "");
  if (!shown.length) return null;
  return (
    <dl
      className={
        columns === 4
          ? "grid grid-cols-4 gap-x-6 gap-y-3 max-lg:grid-cols-2"
          : "grid grid-cols-3 gap-x-6 gap-y-3 max-lg:grid-cols-2"
      }
    >
      {shown.map((f) => (
        <div key={f.label} className={f.wide ? "col-span-full min-w-0" : "min-w-0"}>
          <dt className="text-xs text-fg-3">{f.label}</dt>
          <dd className="flex min-w-0 items-start gap-1 text-sm text-fg">
            <span
              className={
                f.mono ? "min-w-0 font-mono text-xs leading-5 break-all" : "min-w-0 break-words"
              }
            >
              {f.value}
            </span>
            {f.copy ? <CopyButton text={f.copy} label={`Copy ${f.label.toLowerCase()}`} /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionTitle actions={<CopyButton text={text} label={`Copy ${label.toLowerCase()}`} />}>
        {label}
      </SectionTitle>
      <p className="max-h-56 overflow-y-auto rounded-md border border-line bg-field p-3 text-sm leading-relaxed whitespace-pre-wrap text-fg-2">
        {text}
      </p>
    </div>
  );
}

export function Section({
  title,
  icon,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: IconName;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible
      title={title}
      icon={icon}
      defaultOpen={defaultOpen}
      actions={count !== undefined ? <Badge>{count.toLocaleString()}</Badge> : undefined}
    >
      {children}
    </Collapsible>
  );
}
