import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { ChipSelect } from '@/components/controls/chip-select/ChipSelect.tsx'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { TextField } from '@/components/controls/input/TextField.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import {
  CIVITAI_CATEGORIES,
  CIVITAI_PERIODS,
  CIVITAI_SORTS,
  CIVITAI_TYPES,
  type CivitaiBrowse,
  type CivitaiTriState,
} from '@/lib/civitai/browse.ts'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { CivitaiSort } from '@/lib/api.ts'

const TYPE_LABELS: Record<string, string> = {
  TextualInversion: 'Embedding',
  AestheticGradient: 'Aesthetic Gradient',
  LoCon: 'LyCORIS',
  MotionModule: 'Motion',
}

type StatusKey = 'earlyAccess' | 'supportsGeneration' | 'fromPlatform'
const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
  { key: 'earlyAccess', label: 'Early Access' },
  { key: 'supportsGeneration', label: 'On-site Generation' },
  { key: 'fromPlatform', label: 'Made On-site' },
]

export type CivitaiFilterDraft = Pick<
  CivitaiBrowse,
  'period' | 'tag' | 'types' | 'baseModels' | 'earlyAccess' | 'supportsGeneration' | 'fromPlatform'
>

export function filterDraftOf(browse: CivitaiBrowse): CivitaiFilterDraft {
  return {
    period: browse.period,
    tag: browse.tag,
    types: browse.types,
    baseModels: browse.baseModels,
    earlyAccess: browse.earlyAccess,
    supportsGeneration: browse.supportsGeneration,
    fromPlatform: browse.fromPlatform,
  }
}

export function filterDraftEqual(left: CivitaiFilterDraft, right: CivitaiFilterDraft) {
  return (
    left.period === right.period &&
    left.tag === right.tag &&
    left.earlyAccess === right.earlyAccess &&
    left.supportsGeneration === right.supportsGeneration &&
    left.fromPlatform === right.fromPlatform &&
    left.types.length === right.types.length &&
    left.types.every((value) => right.types.includes(value)) &&
    left.baseModels.length === right.baseModels.length &&
    left.baseModels.every((value) => right.baseModels.includes(value))
  )
}

function nextTriState(value: CivitaiTriState): CivitaiTriState {
  return value === 'off' ? 'include' : value === 'include' ? 'exclude' : 'off'
}

function statusClass(value: CivitaiTriState) {
  if (value === 'include') {
    return 'border-accent bg-accent text-ink'
  }
  if (value === 'exclude') {
    return 'border-red bg-red/20 text-red-bright'
  }
  return 'border-line bg-field text-muted hover:text-ink'
}

export function CivitaiFilters({
  browse,
  filterDraft,
  setFilterDraft,
  baseModelOptions,
  filtersOpen,
  filtersRef,
  activeFilterCount,
  filtersChanged,
  onUpdateBrowse,
  onToggle,
  onApply,
  onNsfw,
}: {
  browse: CivitaiBrowse
  filterDraft: CivitaiFilterDraft
  setFilterDraft: Dispatch<SetStateAction<CivitaiFilterDraft>>
  baseModelOptions: { title: string; options: string[] }[]
  filtersOpen: boolean
  filtersRef: RefObject<HTMLDivElement | null>
  activeFilterCount: number
  filtersChanged: boolean
  onUpdateBrowse: (patch: Partial<CivitaiBrowse>) => void
  onToggle: () => void
  onApply: () => void
  onNsfw: () => void
}) {
  return (
    <div className="flex shrink-0 flex-col gap-stack">
      <div className="flex h-toolbar min-w-0 items-stretch gap-cluster">
        <div className="relative min-w-48 flex-1">
          <AppIcon id="search" size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
          <TextField
            className="h-toolbar py-0 pl-8"
            value={browse.query}
            onChange={(event) => onUpdateBrowse({ query: event.target.value })}
            placeholder="Search CivitAI models…"
            aria-label="Search CivitAI models"
          />
        </div>
        <SelectField
          className="w-44 shrink-0"
          icon="arrow-up-down"
          value={browse.sort}
          onChange={(value) => onUpdateBrowse({ sort: value as CivitaiSort })}
          options={[...CIVITAI_SORTS]}
        />
        <div ref={filtersRef} className="relative shrink-0">
          <button
            type="button"
            className={[
              'inline-flex h-full items-center gap-1 rounded border px-2.5 text-sm',
              activeFilterCount > 0
                ? 'border-accent bg-accent text-ink'
                : filtersOpen
                  ? 'border-accent bg-field text-ink'
                  : 'border-line bg-field text-ink hover:text-ink',
            ].join(' ')}
            aria-expanded={filtersOpen}
            onClick={onToggle}
          >
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
            <AppIcon id={filtersOpen ? 'chevron-up' : 'chevron-down'} size={12} />
          </button>
          {filtersOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.25rem)] z-40 w-[min(92vw,24rem)] overflow-visible rounded border border-line bg-panel p-3 shadow-[0_8px_24px_rgb(0_0_0_/_0.45)]">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="mb-1.5 text-xs text-muted">Time period</p>
                  <SegmentSwitch
                    tone="blue"
                    value={filterDraft.period}
                    options={CIVITAI_PERIODS.map((item) => ({ id: item.value, label: item.label }))}
                    onChange={(period) => setFilterDraft((current) => ({ ...current, period }))}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs text-muted">Model status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_FILTERS.map((item) => {
                      const value = filterDraft[item.key]
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={['rounded border px-2 py-1 text-xs', statusClass(value)].join(' ')}
                          title="Click once to include, twice to exclude, and again to clear"
                          aria-label={`${item.label}: ${value}`}
                          onClick={() => setFilterDraft((current) => ({ ...current, [item.key]: nextTriState(current[item.key]) }))}
                        >
                          {value === 'include' ? '✓ ' : value === 'exclude' ? '− ' : ''}
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={[
            'inline-flex h-full shrink-0 items-center gap-1 rounded border px-2.5 text-sm',
            browse.nsfw ? 'border-accent bg-accent text-ink' : 'border-line bg-field text-muted hover:text-ink',
          ].join(' ')}
          aria-pressed={browse.nsfw}
          title={browse.nsfw ? 'Blur mature previews' : 'Show mature previews'}
          onClick={onNsfw}
        >
          <AppIcon id={browse.nsfw ? 'eye' : 'eye-off'} size={14} />
          NSFW
        </button>
      </div>
      <div className="flex min-w-0 flex-wrap items-start gap-cluster">
        <div className="min-w-0 flex-1">
          <SegmentSwitch
            tone="blue"
            value={filterDraft.tag}
            options={CIVITAI_CATEGORIES.map((item) => ({ id: item.value, label: item.label }))}
            onChange={(tag) => setFilterDraft((current) => ({ ...current, tag }))}
          />
        </div>
        <div className="ml-auto flex min-h-9 min-w-0 shrink-0 items-stretch gap-cluster">
          <div className="w-56 min-w-0">
            <ChipSelect
              options={CIVITAI_TYPES}
              value={filterDraft.types}
              onChange={(value) => setFilterDraft((current) => ({ ...current, types: value }))}
              placeholder="Model types"
              chipLabel={(value) => TYPE_LABELS[value] || value}
            />
          </div>
          <div className="w-56 min-w-0">
            <ChipSelect
              options={baseModelOptions}
              value={filterDraft.baseModels}
              onChange={(value) => setFilterDraft((current) => ({ ...current, baseModels: value }))}
              placeholder="Base model"
            />
          </div>
          <button
            type="button"
            className={[
              'inline-flex shrink-0 items-center gap-1 rounded border px-2.5 text-sm',
              filtersChanged ? 'border-accent bg-accent text-ink' : 'border-line bg-field text-muted',
            ].join(' ')}
            disabled={!filtersChanged}
            onClick={onApply}
          >
            Apply filters
          </button>
        </div>
      </div>
    </div>
  )
}
