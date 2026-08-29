import { MODEL_TYPES } from '@/lib/modelTypes.ts'
import type { CivitaiPeriod, CivitaiSort } from '@/lib/api.ts'

export type CivitaiTriState = 'off' | 'include' | 'exclude'

export const CIVITAI_SORTS: CivitaiSort[] = [
  'Highest Rated',
  'Most Downloaded',
  'Most Liked',
  'Most Discussed',
  'Most Collected',
  'Most Images',
  'Newest',
  'Oldest',
]

export const CIVITAI_PERIODS: { value: CivitaiPeriod; label: string }[] = [
  { value: 'Day', label: 'Day' },
  { value: 'Week', label: 'Week' },
  { value: 'Month', label: 'Month' },
  { value: 'Year', label: 'Year' },
  { value: 'AllTime', label: 'All Time' },
]

export const CIVITAI_CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'character', label: 'Character' },
  { value: 'style', label: 'Style' },
  { value: 'concept', label: 'Concept' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'poses', label: 'Poses' },
] as const

export const CIVITAI_TYPES = [
  'Checkpoint',
  'TextualInversion',
  'Hypernetwork',
  'AestheticGradient',
  'LORA',
  'LoCon',
  'DoRA',
  'Controlnet',
  'Upscaler',
  'MotionModule',
  'VAE',
  'Poses',
  'Wildcards',
  'Workflows',
  'Other',
]

export const CIVITAI_BROWSE_LIMIT_MIN = 1
export const CIVITAI_BROWSE_LIMIT_MAX = 100
export const CIVITAI_BROWSE_LIMIT_DEFAULT = 20

export const CIVITAI_BROWSE_DEFAULT = {
  query: '',
  sort: 'Most Downloaded' as CivitaiSort,
  period: 'AllTime' as CivitaiPeriod,
  types: [] as string[],
  baseModels: [] as string[],
  tag: '',
  nsfw: false,
  earlyAccess: 'off' as CivitaiTriState,
  supportsGeneration: 'off' as CivitaiTriState,
  fromPlatform: 'off' as CivitaiTriState,
  limit: CIVITAI_BROWSE_LIMIT_DEFAULT,
}

export type CivitaiBrowse = typeof CIVITAI_BROWSE_DEFAULT

const SORTS = new Set<string>(CIVITAI_SORTS)
const PERIODS = new Set(CIVITAI_PERIODS.map((item) => item.value))
const TAGS = new Set<string>(CIVITAI_CATEGORIES.map((item) => item.value))
const TYPES = new Set(CIVITAI_TYPES)
const BASES = new Set(MODEL_TYPES)

function cleanTri(raw: unknown): CivitaiTriState {
  return raw === 'include' || raw === 'exclude' ? raw : 'off'
}

function cleanCivitaiLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return CIVITAI_BROWSE_LIMIT_DEFAULT
  }
  return Math.max(CIVITAI_BROWSE_LIMIT_MIN, Math.min(CIVITAI_BROWSE_LIMIT_MAX, Math.round(n)))
}

function cleanNames(raw: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: string[] = []
  for (const item of raw) {
    const name = String(item)
    if (allowed.has(name) && !out.includes(name)) {
      out.push(name)
    }
  }
  if (out.length === raw.length && out.every((item, index) => item === raw[index])) {
    return raw as string[]
  }
  return out
}

export function cleanCivitaiBrowse(raw: unknown): CivitaiBrowse {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const sort = typeof row.sort === 'string' && SORTS.has(row.sort) ? (row.sort as CivitaiSort) : CIVITAI_BROWSE_DEFAULT.sort
  const period =
    typeof row.period === 'string' && PERIODS.has(row.period as CivitaiPeriod)
      ? (row.period as CivitaiPeriod)
      : CIVITAI_BROWSE_DEFAULT.period
  const tag = typeof row.tag === 'string' && TAGS.has(row.tag) ? row.tag : CIVITAI_BROWSE_DEFAULT.tag
  return {
    query: typeof row.query === 'string' ? row.query.slice(0, 200) : CIVITAI_BROWSE_DEFAULT.query,
    sort,
    period,
    types: cleanNames(row.types, TYPES),
    baseModels: cleanNames(row.baseModels, BASES),
    tag,
    nsfw: typeof row.nsfw === 'boolean' ? row.nsfw : CIVITAI_BROWSE_DEFAULT.nsfw,
    earlyAccess: cleanTri(row.earlyAccess),
    supportsGeneration: cleanTri(row.supportsGeneration),
    fromPlatform: cleanTri(row.fromPlatform),
    limit: cleanCivitaiLimit(row.limit),
  }
}
