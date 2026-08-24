import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { ChipSelect } from '@/components/primitives/ChipSelect.tsx'
import { SliderField } from '@/components/primitives/SliderField.tsx'
import { downloadAutocompleteCsv, getAutocompleteCsv, openAutocompleteFolder, type AutocompleteCsv } from '@/lib/api.ts'
import { filterTypeSections, MODEL_TYPE_SECTIONS } from '@/lib/modelTypes.ts'
import {
  autocompleteListRule,
  useSettingsStore,
  type AutocompleteMode,
} from '@/stores/settingsStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { SettingsCard } from './SettingsBlock.tsx'
import { useEffect, useMemo, useState } from 'react'

export const AUTOCOMPLETE_GENERAL_QUERY =
  'autocomplete enable disable exclude include whitelist blacklist frequent tags types wildcard lora trigger words thumbnail thumb preview tile scale size'
export const AUTOCOMPLETE_QUERY = 'autocomplete tags csv danbooru download catalog lists folder'

function formatSize(bytes: number) {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  if (bytes > 0) {
    return `${bytes} B`
  }
  return ''
}

const MODE_BTN = 'rounded px-2 py-1 text-xs'

function DownloadedRow({ name, size }: { name: string; size: number }) {
  const lists = useSettingsStore((s) => s.autocompleteLists)
  const hiddenModelTypes = useSettingsStore((s) => s.hiddenModelTypes) ?? []
  const setAutocompleteList = useSettingsStore((s) => s.setAutocompleteList)
  const rule = autocompleteListRule(lists, name)
  const pickerOptions = useMemo(
    () =>
      filterTypeSections(
        MODEL_TYPE_SECTIONS,
        (item) => !hiddenModelTypes.includes(item) || rule.types.includes(item),
      ),
    [hiddenModelTypes, rule.types],
  )

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={rule.enabled}
            onChange={(event) => setAutocompleteList(name, { enabled: event.target.checked })}
          />
          <span className="truncate">{name}</span>
        </label>
        {size > 0 ? <span className="shrink-0 text-xs text-muted">{formatSize(size)}</span> : null}
      </div>
      <div className={rule.enabled ? 'flex flex-col gap-2' : 'pointer-events-none flex flex-col gap-2 opacity-40'}>
        <div className="flex gap-1">
          {(['exclude', 'include'] as AutocompleteMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={[MODE_BTN, rule.mode === mode ? 'bg-accent text-ink' : 'text-muted hover:bg-line hover:text-ink'].join(' ')}
              onClick={() => setAutocompleteList(name, { mode })}
            >
              {mode === 'exclude' ? 'Exclude' : 'Include'}
            </button>
          ))}
        </div>
        <ChipSelect
          options={pickerOptions}
          value={rule.types}
          onChange={(types) => setAutocompleteList(name, { types })}
          placeholder={rule.mode === 'exclude' ? 'Types to exclude…' : 'Types to include…'}
        />
        <p className="text-xs text-muted">
          {rule.mode === 'exclude'
            ? 'Empty means this list is used for every model type.'
            : 'Empty means this list is used for no model types.'}
        </p>
      </div>
    </div>
  )
}

export function AutocompleteGeneralPanel({ query = '' }: { query?: string }) {
  const autocompleteEnabled = useSettingsStore((s) => s.autocompleteEnabled)
  const autocompleteMode = useSettingsStore((s) => s.autocompleteMode)
  const autocompleteTypes = useSettingsStore((s) => s.autocompleteTypes)
  const wildcardCompleteEnabled = useSettingsStore((s) => s.wildcardCompleteEnabled)
  const loraCompleteEnabled = useSettingsStore((s) => s.loraCompleteEnabled)
  const loraTriggerCompleteEnabled = useSettingsStore((s) => s.loraTriggerCompleteEnabled)
  const wildcardCompleteThumbs = useSettingsStore((s) => s.wildcardCompleteThumbs)
  const loraCompleteThumbs = useSettingsStore((s) => s.loraCompleteThumbs)
  const autocompleteThumbScale = useSettingsStore((s) => s.autocompleteThumbScale)
  const frequentTagsEnabled = useSettingsStore((s) => s.frequentTagsEnabled)
  const hiddenModelTypes = useSettingsStore((s) => s.hiddenModelTypes) ?? []
  const setAutocompleteEnabled = useSettingsStore((s) => s.setAutocompleteEnabled)
  const setAutocompleteMode = useSettingsStore((s) => s.setAutocompleteMode)
  const setAutocompleteTypes = useSettingsStore((s) => s.setAutocompleteTypes)
  const setWildcardCompleteEnabled = useSettingsStore((s) => s.setWildcardCompleteEnabled)
  const setLoraCompleteEnabled = useSettingsStore((s) => s.setLoraCompleteEnabled)
  const setLoraTriggerCompleteEnabled = useSettingsStore((s) => s.setLoraTriggerCompleteEnabled)
  const setWildcardCompleteThumbs = useSettingsStore((s) => s.setWildcardCompleteThumbs)
  const setLoraCompleteThumbs = useSettingsStore((s) => s.setLoraCompleteThumbs)
  const setAutocompleteThumbScale = useSettingsStore((s) => s.setAutocompleteThumbScale)
  const setFrequentTagsEnabled = useSettingsStore((s) => s.setFrequentTagsEnabled)
  const pickerOptions = useMemo(
    () =>
      filterTypeSections(
        MODEL_TYPE_SECTIONS,
        (item) => !hiddenModelTypes.includes(item) || autocompleteTypes.includes(item),
      ),
    [autocompleteTypes, hiddenModelTypes],
  )

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Tags" terms="autocomplete enable disable exclude include whitelist blacklist types">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={autocompleteEnabled}
            onChange={(event) => setAutocompleteEnabled(event.target.checked)}
          />
          Enable autocomplete
        </label>
        <div className={autocompleteEnabled ? 'flex flex-col gap-2' : 'pointer-events-none flex flex-col gap-2 opacity-40'}>
          <div className="flex gap-1">
            {(['exclude', 'include'] as AutocompleteMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={[MODE_BTN, autocompleteMode === mode ? 'bg-accent text-ink' : 'text-muted hover:bg-line hover:text-ink'].join(' ')}
                onClick={() => setAutocompleteMode(mode)}
              >
                {mode === 'exclude' ? 'Exclude' : 'Include'}
              </button>
            ))}
          </div>
          <ChipSelect
            options={pickerOptions}
            value={autocompleteTypes}
            onChange={setAutocompleteTypes}
            placeholder={autocompleteMode === 'exclude' ? 'Types to exclude…' : 'Types to include…'}
          />
          <p className="text-xs text-muted">
            {autocompleteMode === 'exclude'
              ? 'Empty means autocomplete is used for every model type.'
              : 'Empty means autocomplete is used for no model types.'}
          </p>
        </div>
      </SettingsCard>
      <SettingsCard query={query} title="Wildcards" terms="wildcard enable autocomplete">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={wildcardCompleteEnabled}
            onChange={(event) => setWildcardCompleteEnabled(event.target.checked)}
          />
          Enable wildcard autocomplete
        </label>
      </SettingsCard>
      <SettingsCard query={query} title="LoRA" terms="lora enable autocomplete trigger words">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={loraCompleteEnabled}
            onChange={(event) => setLoraCompleteEnabled(event.target.checked)}
          />
          Enable LoRA autocomplete
        </label>
        <label
          className={[
            'flex items-center gap-2 text-sm text-ink',
            loraCompleteEnabled ? '' : 'pointer-events-none opacity-40',
          ].join(' ')}
        >
          <input
            type="checkbox"
            className="check"
            checked={loraTriggerCompleteEnabled}
            onChange={(event) => setLoraTriggerCompleteEnabled(event.target.checked)}
            disabled={!loraCompleteEnabled}
          />
          Enable LoRA trigger words
        </label>
      </SettingsCard>
      <SettingsCard query={query} title="Thumbnails" terms="thumbnail thumb preview tile scale size wildcard lora">
        <label
          className={[
            'flex items-center gap-2 text-sm text-ink',
            wildcardCompleteEnabled ? '' : 'pointer-events-none opacity-40',
          ].join(' ')}
        >
          <input
            type="checkbox"
            className="check"
            checked={wildcardCompleteThumbs}
            onChange={(event) => setWildcardCompleteThumbs(event.target.checked)}
            disabled={!wildcardCompleteEnabled}
          />
          Show wildcard thumbnails
        </label>
        <label
          className={[
            'flex items-center gap-2 text-sm text-ink',
            loraCompleteEnabled ? '' : 'pointer-events-none opacity-40',
          ].join(' ')}
        >
          <input
            type="checkbox"
            className="check"
            checked={loraCompleteThumbs}
            onChange={(event) => setLoraCompleteThumbs(event.target.checked)}
            disabled={!loraCompleteEnabled}
          />
          Show LoRA thumbnails
        </label>
        <SliderField
          label="Scale"
          value={autocompleteThumbScale}
          onChange={setAutocompleteThumbScale}
          min={0.5}
          max={2}
          step={0.1}
        />
        <p className="text-xs text-muted">1 is the default preview size.</p>
      </SettingsCard>
      <SettingsCard query={query} title="Frequent tags" terms="frequent tags enable star usage">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={frequentTagsEnabled}
            onChange={(event) => setFrequentTagsEnabled(event.target.checked)}
          />
          Enable frequent tags
        </label>
        <p className="text-xs text-muted">Off skips saving tags after generate and hides them from autocomplete ranking.</p>
      </SettingsCard>
    </div>
  )
}

export function AutocompletePanel({ query = '' }: { query?: string }) {
  const [files, setFiles] = useState<AutocompleteCsv[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    void getAutocompleteCsv()
      .then(setFiles)
      .catch((err) => toast(err instanceof Error ? err.message : 'Could not load tag lists', 'error'))
  }, [])

  async function download(name: string) {
    if (busy) {
      return
    }
    setBusy(name)
    try {
      const next = await downloadAutocompleteCsv(name)
      setFiles((rows) => {
        const found = rows.some((row) => row.name === next.name)
        if (!found) {
          return [...rows, next].sort((a, b) => a.name.localeCompare(b.name))
        }
        return rows.map((row) => (row.name === next.name ? next : row))
      })
      toast(`Downloaded ${name}`, 'ok')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Download failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function openDir() {
    try {
      await openAutocompleteFolder()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open folder', 'error')
    }
  }

  const downloaded = files.filter((item) => item.downloaded)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <button
        type="button"
        className="flex items-center gap-1.5 self-start rounded px-2 py-1.5 text-sm text-muted hover:bg-line hover:text-ink"
        onClick={() => void openDir()}
      >
        <AppIcon id="square-arrow-out-up-right" size={14} />
        Open folder
      </button>
      <SettingsCard query={query} title="Downloaded" terms={AUTOCOMPLETE_QUERY}>
        {downloaded.length === 0 ? (
          <p className="text-xs text-muted">No tag lists downloaded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {downloaded.map((item) => (
              <DownloadedRow key={item.name} name={item.name} size={item.size} />
            ))}
          </div>
        )}
      </SettingsCard>
      <SettingsCard query={query} title="Catalog" terms={AUTOCOMPLETE_QUERY}>
        <p className="text-xs text-muted">
          Download model-specific Danbooru tag CSVs. Enabled lists feed prompt autocomplete for matching model types.
        </p>
        {files.length === 0 ? (
          <p className="text-xs text-muted">No catalogs listed. Check your network and try again.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {files.map((item) => (
              <div key={item.name} className="flex items-center gap-2 rounded border border-line bg-field px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{item.name}</div>
                  {item.size > 0 ? <div className="text-xs text-muted">{formatSize(item.size)}</div> : null}
                </div>
                {item.downloaded ? (
                  <span className="shrink-0 text-xs text-muted">Downloaded</span>
                ) : (
                  <button
                    type="button"
                    className="shrink-0 rounded bg-accent px-2 py-1 text-xs text-ink disabled:opacity-40"
                    disabled={busy !== null}
                    onClick={() => void download(item.name)}
                  >
                    {busy === item.name ? 'Downloading…' : 'Download'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
    </div>
  )
}
