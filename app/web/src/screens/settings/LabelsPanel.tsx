import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { IconPicker } from '@/components/chrome/IconPicker.tsx'
import { type CivitaiMarkEntry, type CivitaiMarks } from '@/lib/civitai/marks.ts'
import { MODEL_TYPES } from '@/lib/modelTypes.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { SettingsCard } from './SettingsBlock.tsx'

export const CIVITAI_LABELS_QUERY = 'civitai labels marks short form il xl pony base model tile badge icon'

const INPUT =
  'box-border h-8 w-20 shrink-0 rounded border border-line bg-field px-2 py-0 font-mono text-sm leading-[1.875rem] text-ink outline-none placeholder:text-muted focus:border-accent'

function orderedNames(marks: CivitaiMarks) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of MODEL_TYPES) {
    if (name in marks) {
      out.push(name)
      seen.add(name)
    }
  }
  for (const name of Object.keys(marks)
    .filter((item) => !seen.has(item))
    .sort((a, b) => a.localeCompare(b))) {
    out.push(name)
  }
  return out
}

export function LabelsPanel({ query = '' }: { query?: string }) {
  const marks = useSettingsStore((state) => state.civitaiMarks)
  const setCivitaiMarks = useSettingsStore((state) => state.setCivitaiMarks)

  function patch(name: string, next: CivitaiMarkEntry) {
    setCivitaiMarks({ ...marks, [name]: next })
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Labels" terms={CIVITAI_LABELS_QUERY} id="settings-civitai-labels">
        <p className="text-xs text-muted">
          Short names shown on CivitAI search tiles. Pick an icon to replace the text, or leave the icon empty and edit
          the short form.
        </p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 px-1.5 text-xs text-muted">
            <span className="min-w-0 flex-1">Base model</span>
            <span className="w-16 shrink-0 text-center">Icon</span>
            <span className="w-20 shrink-0">Short</span>
          </div>
          {orderedNames(marks).map((name) => {
            const row = marks[name] || { text: '' }
            return (
              <div key={name} className="flex items-center gap-1.5 rounded-md border border-line bg-panel p-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink" title={name}>
                  {name}
                </span>
                <IconPicker
                  value={row.icon ?? null}
                  colors={[]}
                  onChange={(icon) => patch(name, { text: row.text, icon })}
                />
                <span className="flex w-8 shrink-0 justify-center">
                  {row.icon ? (
                    <button
                      type="button"
                      className="icon-btn shrink-0"
                      aria-label={`Clear icon for ${name}`}
                      title="Clear icon"
                      onClick={() => patch(name, { text: row.text })}
                    >
                      <AppIcon id="x" />
                    </button>
                  ) : null}
                </span>
                <input
                  className={INPUT}
                  value={row.text}
                  onChange={(event) =>
                    patch(name, row.icon ? { text: event.target.value, icon: row.icon } : { text: event.target.value })
                  }
                  spellCheck={false}
                  maxLength={12}
                  placeholder="XL"
                />
              </div>
            )
          })}
        </div>
      </SettingsCard>
    </div>
  )
}
