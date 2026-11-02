/**
 * Dev mode only: a floating panel in the bottom-left corner that switches the layout variants on
 * screen (`useVariant` in `lib/variants.ts`). Shows only while a variant is mounted.
 */
import { Icon } from "@client/icons/Icon";
import { useVariants } from "@client/lib/variants";
import { Badge, IconButton, Segmented } from "@client/ui";
import { useState } from "react";

export function VariantPanel() {
  const onScreen = useVariants((s) => s.onScreen);
  const picked = useVariants((s) => s.picked);
  const pick = useVariants((s) => s.pick);
  const [open, setOpen] = useState(true);
  const keys = Object.keys(onScreen);
  if (!keys.length) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[390] w-80 max-w-[calc(100vw-32px)] rounded-lg border border-line-strong bg-surface-3 shadow-pop max-lg:bottom-[72px]">
      <div className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
        <Icon name="layout-grid" size={14} className="text-accent-ink" />
        <span className="flex-1 text-sm font-medium text-fg">Layouts</span>
        <Badge>dev</Badge>
        <IconButton
          icon={open ? "chevron-down" : "chevron-up"}
          label={open ? "Collapse" : "Expand"}
          size="xs"
          onClick={() => setOpen((o) => !o)}
        />
      </div>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-line p-3">
          {keys.map((key) => {
            const v = onScreen[key];
            if (!v) return null;
            return (
              <div key={key} className="flex flex-col gap-1.5">
                <span className="text-xs text-fg-3">{v.label}</span>
                <Segmented
                  size="sm"
                  full
                  label={v.label}
                  value={picked[key] ?? v.options[0]?.id ?? ""}
                  onChange={(id) => pick(key, id)}
                  options={v.options.map((o) => ({ value: o.id, label: o.label }))}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
