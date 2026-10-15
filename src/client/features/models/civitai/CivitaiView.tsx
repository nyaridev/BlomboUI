/**
 * Models → Civitai: the browser plus opened model tabs. The browser stays mounted (hidden) while
 * a model tab is in front, so its scroll position and loaded pages survive switching back.
 */
import { Chip } from "@client/ui";
import { Browse } from "./Browse";
import { ModelPage } from "./ModelPage";
import { useCivitai } from "./state";

export function CivitaiView() {
  const tabs = useCivitai((s) => s.tabs);
  const active = useCivitai((s) => s.active);
  const show = useCivitai((s) => s.show);
  const close = useCivitai((s) => s.close);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {tabs.length ? (
        <div
          className="scroll-quiet flex items-center gap-1 overflow-x-auto border-b border-line bg-surface px-5 py-1.5"
          role="tablist"
          aria-label="Opened Civitai models"
        >
          <Chip size="sm" icon="search" selected={active === null} onClick={() => show(null)}>
            Browse
          </Chip>
          {tabs.map((t) => (
            <Chip
              key={t.id}
              size="sm"
              icon="layers"
              selected={active === t.id}
              onClick={() => show(t.id)}
              onRemove={() => close(t.id)}
              className="max-w-[240px] shrink-0"
            >
              <span className="truncate">{t.name}</span>
            </Chip>
          ))}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <div hidden={active !== null} className="absolute inset-0 flex flex-col">
          <Browse />
        </div>
        {active !== null ? (
          <div className="absolute inset-0">
            <ModelPage key={active} id={active} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
