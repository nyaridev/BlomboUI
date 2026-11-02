/**
 * Settings → Shortcuts: every shortcut, searchable. App-wide actions can be rebound (click the
 * keys, press new ones; Backspace removes the shortcut, Escape cancels); keys that belong to one
 * view are listed below them, read-only. Overrides are saved in settings.shortcuts.overrides.
 */
import { pauseShortcuts } from "@client/app/useShortcuts";
import { Icon } from "@client/icons/Icon";
import { cn } from "@client/lib/cn";
import { useSettings, useUpdateSettings } from "@client/lib/queries";
import { Button, IconButton, Kbd, Panel, TextField } from "@client/ui";
import {
  comboFromEvent,
  comboParts,
  FIXED_SHORTCUTS,
  normalizeCombo,
  resolveShortcuts,
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS,
  type ShortcutAction,
  setShortcut,
  shortcutConflicts,
} from "@shared/shortcuts";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { PageHeader } from "./common";

function Keys({ combo, muted }: { combo: string; muted?: boolean }) {
  const parts = combo.includes(" / ") ? combo.split(" / ") : [combo];
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", muted && "opacity-60")}>
      {parts.map((p, i) => (
        <span key={p} className="inline-flex items-center gap-1">
          {i > 0 ? <span className="text-2xs text-fg-4">or</span> : null}
          {(p.includes("+") && p.length > 1 ? comboParts(p) : [p]).map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

/** One rebindable action, with everything its row needs. */
interface Item {
  action: ShortcutAction;
  combo: string;
  changed: boolean;
  /** Other actions with the same keys. */
  clash: string[];
  recording: boolean;
  record: () => void;
  stop: () => void;
  onKey: (e: KeyboardEvent) => void;
  reset: () => void;
}

export function ShortcutsPage() {
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const overrides = settings?.shortcuts.overrides ?? [];
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<string | null>(null);
  const bindings = useMemo(() => resolveShortcuts(overrides), [overrides]);
  const conflicts = useMemo(() => shortcutConflicts(bindings), [bindings]);
  const save = (next: Array<{ action: string; keys: string }>) =>
    update.mutate({ shortcuts: { overrides: next } });

  // While recording, the app's own shortcuts step aside.
  useEffect(() => (recording ? pauseShortcuts() : undefined), [recording]);

  const q = query.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);
  const fixed = FIXED_SHORTCUTS.filter((f) => match(f.label) || match(f.where) || match(f.keys));

  const item = (a: ShortcutAction): Item => {
    const combo = bindings.get(a.id) ?? "";
    return {
      action: a,
      combo,
      changed: overrides.some((o) => o.action === a.id),
      clash: combo
        ? (conflicts.get(combo) ?? [])
            .filter((id) => id !== a.id)
            .map((id) => SHORTCUT_ACTIONS.find((x) => x.id === id)?.label ?? id)
        : [],
      recording: recording === a.id,
      record: () => setRecording(recording === a.id ? null : a.id),
      stop: () => recording === a.id && setRecording(null),
      onKey: (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") return setRecording(null);
        if (e.key === "Backspace" || e.key === "Delete") {
          save(setShortcut(overrides, a.id, ""));
          return setRecording(null);
        }
        const next = comboFromEvent(e.nativeEvent);
        if (!next) return;
        save(setShortcut(overrides, a.id, next));
        setRecording(null);
      },
      reset: () => save(overrides.filter((o) => o.action !== a.id)),
    };
  };
  const groups = SHORTCUT_GROUPS.map((group) => ({
    group,
    items: SHORTCUT_ACTIONS.filter(
      (a) =>
        a.group === group && (match(a.label) || match(a.group) || match(bindings.get(a.id) ?? "")),
    ).map(item),
  })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader title="Shortcuts" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <TextField
          icon="search"
          size="sm"
          placeholder="Search shortcuts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          className="w-72 max-lg:w-full"
        />
        <span className="ml-auto text-xs text-fg-3">
          {overrides.length
            ? `${overrides.length} changed from the defaults`
            : "All shortcuts are the defaults"}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon="undo"
          disabled={!overrides.length}
          onClick={() => save([])}
        >
          Reset all
        </Button>
      </div>
      <p className="mb-6 flex items-center gap-2 text-xs text-fg-3">
        <Icon name="edit" size={13} className="text-accent-ink" />
        Click a shortcut to change it, then press the new keys. Backspace removes it, Esc cancels.
      </p>

      <div className="flex flex-col gap-6">
        {groups.map(({ group, items }) => (
          <section key={group} className="flex flex-col gap-2">
            <h2 className="label-caps">{group}</h2>
            <ShortcutTable items={items} />
          </section>
        ))}

        {fixed.length ? (
          <section className="flex flex-col gap-2">
            <h2 className="label-caps">In one view</h2>
            <p className="-mt-1 text-xs text-fg-3">
              These belong to one screen and can't be changed.
            </p>
            <Panel className="flex flex-col divide-y divide-line">
              {fixed.map((f) => (
                <div
                  key={`${f.where}-${f.label}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-1.5"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm text-fg">{f.label}</span>
                    <span className="text-xs text-fg-3">{f.where}</span>
                  </span>
                  <Keys combo={f.keys} muted />
                </div>
              ))}
            </Panel>
          </section>
        ) : null}

        {!groups.length && !fixed.length ? (
          <p className="py-8 text-center text-sm text-fg-3">No shortcut matches “{query}”.</p>
        ) : null}
      </div>
    </>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────── */

/** The keys as a dashed chip with a pencil, so it reads as editable. Click it to record a combo. */
function KeyButton({ item, className }: { item: Item; className?: string }) {
  const { action, combo, recording } = item;
  return (
    <button
      type="button"
      onClick={item.record}
      onKeyDown={recording ? item.onKey : undefined}
      onBlur={item.stop}
      aria-label={`${action.label}: ${combo || "no shortcut"}. Press to change.`}
      className={cn(
        "group/key flex h-8 items-center gap-2 rounded-md border px-2 text-left transition-colors focus-ring",
        recording
          ? "border-accent bg-accent/10 text-accent-ink"
          : "border-dashed border-line-strong hover:border-accent-ink/60 hover:bg-field",
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1">
        {recording ? (
          <span className="truncate text-xs">Press keys…</span>
        ) : combo ? (
          <Keys combo={combo} />
        ) : (
          <span className="text-xs text-fg-4">None</span>
        )}
      </span>
      {recording ? (
        <span className="text-2xs text-fg-3">Esc</span>
      ) : (
        <Icon
          name="edit"
          size={13}
          className="shrink-0 text-fg-4 transition-colors group-hover/key:text-accent-ink"
        />
      )}
    </button>
  );
}

function Clash({ item }: { item: Item }) {
  if (!item.clash.length) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-warning">
      <Icon name="info" size={12} />
      Same keys as {item.clash.join(", ")}; only the first one runs.
    </span>
  );
}

const defaultLabel = (a: ShortcutAction) =>
  normalizeCombo(a.keys) ? comboParts(a.keys).join(" ") : "none";

function ResetButton({ item }: { item: Item }) {
  return (
    <IconButton
      icon="undo"
      size="sm"
      label={`Back to the default (${defaultLabel(item.action)})`}
      disabled={!item.changed}
      className={cn(!item.changed && "invisible")}
      onClick={item.reset}
    />
  );
}

/* ── the table: Action · Shortcut · Default, the keys as dashed chips ── */

function ShortcutTable({ items }: { items: Item[] }) {
  const cols = "grid grid-cols-[minmax(0,1fr)_200px_120px_32px] items-center gap-3";
  return (
    <Panel className="flex flex-col divide-y divide-line">
      <div className={cn(cols, "px-4 py-2 text-2xs font-medium text-fg-4 max-lg:hidden")}>
        <span>Action</span>
        <span>Shortcut</span>
        <span>Default</span>
        <span />
      </div>
      {items.map((it) => (
        <div
          key={it.action.id}
          className={cn(cols, "min-h-11 px-4 py-1.5 max-lg:grid-cols-[minmax(0,1fr)_auto_32px]")}
        >
          <span className="flex min-w-0 flex-col">
            <span className="text-sm text-fg">{it.action.label}</span>
            <Clash item={it} />
          </span>
          <KeyButton item={it} className="w-full max-lg:w-36" />
          <span
            className={cn(
              "font-mono text-xs max-lg:hidden",
              it.changed ? "text-fg-2" : "text-fg-4",
            )}
          >
            {defaultLabel(it.action)}
          </span>
          <ResetButton item={it} />
        </div>
      ))}
    </Panel>
  );
}
