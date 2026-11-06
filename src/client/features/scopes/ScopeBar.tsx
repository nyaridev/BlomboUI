/**
 * The scope bar beside a model grid's filters (Models → Local, the Generate pickers): the scopes
 * whose pictures cards show. Each picked scope is a chip: click it to make it optional (a
 * picture may leave it out) or required again, × drops it. "Scopes" adds one (searchable, by
 * group; picking one replaces another of its group). Auto takes them from the Generate prompt
 * instead. Hidden while scopes are off (avatar menu → Scopes).
 */
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useGoToView } from "@client/lib/hooks";
import { usePatchScopes, useScopes } from "@client/lib/queries";
import { Button, Chip, Popover, TextField, Tooltip, toast } from "@client/ui";
import { type ScopeDef, type ScopeView, togglePick } from "@shared/scopes";
import { useMemo, useState } from "react";
import { useScopePick } from "./pick";

export function ScopeBar({ className }: { className?: string }) {
  const file = useScopes().data;
  const patch = usePatchScopes();
  const autoPick = useScopePick((s) => s.pick.ids);
  if (!file?.enabled) return null;
  const { view, scopes } = file;
  const byId = new Map(scopes.map((s) => [s.id, s]));
  const setView = (next: ScopeView) =>
    patch.mutate({ view: next }, { onError: (e) => toast(e.message, "error") });
  const ids = view.auto ? autoPick : view.ids.filter((id) => byId.has(id));

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <ScopeMenu
        scopes={scopes}
        picked={view.ids}
        disabled={view.auto}
        onToggle={(id) => setView(togglePick(view, id, scopes))}
      />
      <div className="scroll-quiet flex min-w-0 items-center gap-1.5 overflow-x-auto">
        {ids.length === 0 ? (
          <span className="shrink-0 px-1 text-xs text-fg-3">
            {view.auto ? "No scope in the prompt: global pictures" : "Global pictures"}
          </span>
        ) : (
          ids.map((id) => {
            const scope = byId.get(id);
            if (!scope) return null;
            const optional = view.auto || view.optional.includes(id);
            return (
              <Tooltip
                key={id}
                content={
                  view.auto
                    ? "Picked by Auto from the Generate prompt"
                    : optional
                      ? "Optional: pictures may leave it out. Click to require it."
                      : "Required: pictures must have it. Click to make it optional."
                }
              >
                <span className="shrink-0">
                  <Chip
                    size="sm"
                    selected={!optional}
                    className={cn(optional && "border-dashed")}
                    onClick={
                      view.auto
                        ? undefined
                        : () =>
                            setView({
                              ...view,
                              optional: optional
                                ? view.optional.filter((x) => x !== id)
                                : [...view.optional, id],
                            })
                    }
                    onRemove={view.auto ? undefined : () => setView(togglePick(view, id, scopes))}
                  >
                    {scope.name}
                    {optional && !view.auto ? <span className="text-fg-3">optional</span> : null}
                  </Chip>
                </span>
              </Tooltip>
            );
          })
        )}
      </div>
      <Tooltip
        content={
          view.auto
            ? "Auto is on: scopes follow the Generate prompt's tags. Click to pick them yourself."
            : "Pick scopes from the Generate prompt's tags"
        }
      >
        <span className="shrink-0">
          <Chip
            size="sm"
            icon="sparkle"
            selected={view.auto}
            onClick={() => setView({ ...view, auto: !view.auto })}
          >
            Auto
          </Chip>
        </span>
      </Tooltip>
    </div>
  );
}

/** "Scopes ▾": a searchable list of scopes by group, the picked ones checked. */
function ScopeMenu({
  scopes,
  picked,
  disabled,
  onToggle,
}: {
  scopes: ScopeDef[];
  picked: string[];
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  const go = useGoToView();
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = new Map<string, ScopeDef[]>();
    for (const s of scopes) {
      if (q && !`${s.name} ${s.group} ${s.tags.join(" ")}`.toLowerCase().includes(q)) continue;
      out.set(s.group, [...(out.get(s.group) ?? []), s]);
    }
    // Ungrouped first, then groups by name.
    return [...out].sort(([a], [b]) => (a ? (b ? a.localeCompare(b) : 1) : -1));
  }, [scopes, query]);

  return (
    <Popover
      placement="bottom-start"
      onOpenChange={(o) => !o && setQuery("")}
      trigger={
        <Button
          size="sm"
          variant="secondary"
          icon="scopes"
          iconRight="chevron-down"
          disabled={disabled}
          className="shrink-0"
        >
          Scopes
        </Button>
      }
    >
      {(close) => (
        <div className="flex w-64 flex-col gap-2 p-2">
          {scopes.length > 6 ? (
            <TextField
              icon="search"
              size="sm"
              placeholder="Find a scope"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery("")}
              aria-label="Find a scope"
              autoFocus
            />
          ) : null}
          <div className="scroll-quiet flex max-h-72 flex-col overflow-y-auto">
            {scopes.length === 0 ? (
              <p className="px-2 py-3 text-sm text-fg-3">
                No scopes yet. Make them in Scopes, then pick them here.
              </p>
            ) : groups.length === 0 ? (
              <p className="px-2 py-3 text-sm text-fg-3">No scope matches.</p>
            ) : (
              groups.map(([group, list]) => (
                <div key={group || "-"} className="flex flex-col">
                  {group ? <span className="label-caps px-2 pt-2 pb-1">{group}</span> : null}
                  {list.map((s) => {
                    const on = picked.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onToggle(s.id)}
                        className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-fg-2 hover:bg-field hover:text-fg focus-ring"
                      >
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                        {on ? <Icon name="check" size={14} className="text-accent-ink" /> : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon="settings"
            onClick={() => {
              close();
              go("scopes");
            }}
          >
            Manage scopes
          </Button>
        </div>
      )}
    </Popover>
  );
}
