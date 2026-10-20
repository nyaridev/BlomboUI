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
  setShortcut,
  shortcutConflicts,
} from "@shared/shortcuts";
import { useEffect, useMemo, useState } from "react";
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
  const actions = SHORTCUT_ACTIONS.filter(
    (a) => match(a.label) || match(a.group) || match(bindings.get(a.id) ?? ""),
  );
  const fixed = FIXED_SHORTCUTS.filter((f) => match(f.label) || match(f.where) || match(f.keys));

  const onRecordKey = (action: string, e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return setRecording(null);
    if (e.key === "Backspace" || e.key === "Delete") {
      save(setShortcut(overrides, action, ""));
      return setRecording(null);
    }
    const combo = comboFromEvent(e.nativeEvent);
    if (!combo) return;
    save(setShortcut(overrides, action, combo));
    setRecording(null);
  };

  return (
    <>
      <PageHeader
        title="Shortcuts"
        text="Keys for things you do often. Click a shortcut to change it. Saved to this profile."
      />
      <div className="mb-4 flex items-center gap-2">
        <TextField
          icon="search"
          size="sm"
          placeholder="Search shortcuts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          className="w-72"
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

      <div className="flex flex-col gap-6">
        {SHORTCUT_GROUPS.map((group) => {
          const rows = actions.filter((a) => a.group === group);
          if (!rows.length) return null;
          return (
            <section key={group} className="flex flex-col gap-2">
              <h2 className="label-caps">{group}</h2>
              <Panel className="flex flex-col divide-y divide-line">
                {rows.map((a) => {
                  const combo = bindings.get(a.id) ?? "";
                  const changed = overrides.some((o) => o.action === a.id);
                  const clash = combo ? conflicts.get(combo) : undefined;
                  const isRecording = recording === a.id;
                  return (
                    <div key={a.id} className="flex min-h-11 items-center gap-3 px-4 py-1.5">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm text-fg">{a.label}</span>
                        {clash ? (
                          <span className="flex items-center gap-1 text-xs text-warning">
                            <Icon name="info" size={12} />
                            Same keys as{" "}
                            {clash
                              .filter((id) => id !== a.id)
                              .map((id) => SHORTCUT_ACTIONS.find((x) => x.id === id)?.label)
                              .join(", ")}
                            ; only the first one runs.
                          </span>
                        ) : null}
                      </span>
                      {changed ? (
                        <span className="text-2xs text-fg-4">
                          default {normalizeCombo(a.keys) ? comboParts(a.keys).join(" ") : "none"}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setRecording(isRecording ? null : a.id)}
                        onKeyDown={isRecording ? (e) => onRecordKey(a.id, e) : undefined}
                        onBlur={() => isRecording && setRecording(null)}
                        aria-label={`${a.label}: ${combo || "no shortcut"}. Press to change.`}
                        className={cn(
                          "flex h-8 min-w-[120px] items-center justify-end gap-1 rounded-md border px-2 transition-colors focus-ring",
                          isRecording
                            ? "border-accent bg-accent/10 text-accent-ink"
                            : "border-transparent hover:border-line hover:bg-field",
                        )}
                      >
                        {isRecording ? (
                          <span className="text-xs">Press keys… Backspace for none</span>
                        ) : combo ? (
                          <Keys combo={combo} />
                        ) : (
                          <span className="text-xs text-fg-4">None</span>
                        )}
                      </button>
                      <IconButton
                        icon="undo"
                        size="sm"
                        label="Back to the default"
                        disabled={!changed}
                        className={cn(!changed && "invisible")}
                        onClick={() => save(overrides.filter((o) => o.action !== a.id))}
                      />
                    </div>
                  );
                })}
              </Panel>
            </section>
          );
        })}

        {fixed.length ? (
          <section className="flex flex-col gap-2">
            <h2 className="label-caps">In one view</h2>
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

        {!actions.length && !fixed.length ? (
          <p className="py-8 text-center text-sm text-fg-3">No shortcut matches “{query}”.</p>
        ) : null}
      </div>
    </>
  );
}
