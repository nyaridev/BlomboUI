import { SliderField } from '@/components/primitives/SliderField.tsx'
import { SettingsCard } from './SettingsBlock.tsx'
import {
  GENERATE_FILTER_VIEWS,
  galleryModeValue,
  useSettingsStore,
  type GalleryFilterScope,
  type GalleryModeKey,
} from '@/stores/settingsStore.ts'

export const GALLERY_QUERY =
  'gallery view tiles scale size base model lora wildcards tree folder parent unselect thumbnail scope filter share local generate models types'

function ScopeSwitch({
  value,
  onChange,
}: {
  value: GalleryFilterScope
  onChange: (value: GalleryFilterScope) => void
}) {
  return (
    <div className="flex gap-1">
      {(['global', 'local'] as const).map((item) => (
        <button
          key={item}
          type="button"
          className={[
            'rounded border px-2 py-1 text-xs',
            value === item ? 'border-accent bg-accent text-ink' : 'border-line bg-field text-muted hover:text-ink',
          ].join(' ')}
          onClick={() => onChange(item)}
        >
          {item === 'global' ? 'Global' : 'Local'}
        </button>
      ))}
    </div>
  )
}

function ModeRow({
  title,
  value,
  onChange,
}: {
  title: string
  value: GalleryFilterScope
  onChange: (value: GalleryFilterScope) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-ink">{title}</span>
      <ScopeSwitch value={value} onChange={onChange} />
    </div>
  )
}

export function GalleryPanel({ query = '' }: { query?: string }) {
  const galleryTileScale = useSettingsStore((s) => s.galleryTileScale)
  const galleryParentOnUnselect = useSettingsStore((s) => s.galleryParentOnUnselect)
  const setGalleryTileScale = useSettingsStore((s) => s.setGalleryTileScale)
  const setGalleryParentOnUnselect = useSettingsStore((s) => s.setGalleryParentOnUnselect)
  const shareModels = useSettingsStore((s) => s.galleryFilterShareModels)
  const scopeMode = useSettingsStore((s) => s.galleryScopeMode)
  const filterMode = useSettingsStore((s) => s.galleryFilterMode)
  const setShareModels = useSettingsStore((s) => s.setGalleryFilterShareModels)
  const setScopeMode = useSettingsStore((s) => s.setGalleryScopeMode)
  const setFilterMode = useSettingsStore((s) => s.setGalleryFilterMode)
  const modelsScope = galleryModeValue(scopeMode, 'models')
  const modelsFilter = galleryModeValue(filterMode, 'models')

  return (
    <div className="flex max-w-xl flex-col gap-3">
      {GENERATE_FILTER_VIEWS.map((view) => {
        const key = view.key as GalleryModeKey
        return (
          <SettingsCard
            key={view.key}
            query={query}
            title={view.label}
            terms={`${view.label} generate scopes filters global local`}
          >
            <ModeRow
              title="Scopes"
              value={galleryModeValue(scopeMode, key)}
              onChange={(value) => setScopeMode(key, value)}
            />
            <ModeRow
              title="Filters"
              value={galleryModeValue(filterMode, key)}
              onChange={(value) => setFilterMode(key, value)}
            />
          </SettingsCard>
        )
      })}
      <SettingsCard
        query={query}
        title="Models"
        terms="models scopes filters global local share categories all base model lora wildcards"
      >
        <ModeRow title="Scopes" value={modelsScope} onChange={(value) => setScopeMode('models', value)} />
        <ModeRow title="Filters" value={modelsFilter} onChange={(value) => setFilterMode('models', value)} />
        {modelsScope === 'local' || modelsFilter === 'local' ? (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="check"
              checked={shareModels}
              onChange={(event) => setShareModels(event.target.checked)}
            />
            Share across model categories
          </label>
        ) : null}
      </SettingsCard>
      <SettingsCard query={query} title="Tiles" terms="tile scale size zoom">
        <SliderField value={galleryTileScale} onChange={setGalleryTileScale} min={0.5} max={2} step={0.1} />
        <p className="text-xs text-muted">1 is the current tile size.</p>
      </SettingsCard>
      <SettingsCard query={query} title="Tree" terms="folder directory parent unselect search">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={galleryParentOnUnselect}
            onChange={(event) => setGalleryParentOnUnselect(event.target.checked)}
          />
          Select parent when unselecting a folder
        </label>
        <p className="text-xs text-muted">
          Clicking the selected folder in the gallery tree selects its parent. Off clears the search instead.
        </p>
      </SettingsCard>
    </div>
  )
}
