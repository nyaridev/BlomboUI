import { contextKey } from '@/lib/gallery/thumbView.ts'
import { formatLoraStrength, loraStem } from '@/lib/prompt/loraTags.ts'
import { wildcardTag } from '@/lib/prompt/wildcardTags.ts'
import type { ModelEntry } from '@/lib/api.ts'
import { modelPath } from '@/stores/modelsStore.ts'

export const SCOPE_THUMBS_TYPES = ['checkpoints', 'loras', 'wildcards'] as const
export type ScopeThumbsType = (typeof SCOPE_THUMBS_TYPES)[number]

export type ScopeThumbsSource = 'directory' | 'selected'

export const SCOPE_THUMBS_ROOT = '.'

export type ScopeThumbTarget = {
  kind: 'checkpoints' | 'diffusion_models' | 'loras' | 'wildcards'
  path: string
  tag: string
}

export type ScopeThumbsDirectories = Record<ScopeThumbsType, string>

export type ScopeThumbsSettings = {
  scopeIds: string[]
  type: ScopeThumbsType
  search: string
  source: ScopeThumbsSource
  directory: string
  directories: ScopeThumbsDirectories
  selected: string[]
  skipExisting: boolean
  applyAfter: boolean
}

function emptyDirectories(): ScopeThumbsDirectories {
  return { checkpoints: '', loras: '', wildcards: '' }
}

export const DEFAULT_SCOPE_THUMBS: ScopeThumbsSettings = {
  scopeIds: [],
  type: 'loras',
  search: '',
  source: 'selected',
  directory: '',
  directories: emptyDirectories(),
  selected: [],
  skipExisting: false,
  applyAfter: true,
}

export const SCOPE_THUMBS_TYPE_OPTIONS = [
  { value: 'checkpoints', label: 'Base Model' },
  { value: 'loras', label: 'LoRA' },
  { value: 'wildcards', label: 'Wildcards' },
] as const

export function isScopeThumbsType(value: unknown): value is ScopeThumbsType {
  return value === 'checkpoints' || value === 'loras' || value === 'wildcards'
}

export function isScopeThumbsSource(value: unknown): value is ScopeThumbsSource {
  return value === 'directory' || value === 'selected'
}

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') {
      continue
    }
    const value = item.trim()
    if (!value || seen.has(value)) {
      continue
    }
    seen.add(value)
    out.push(value)
  }
  return out
}

function mergeDirectories(raw: unknown): ScopeThumbsDirectories {
  const out = emptyDirectories()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return out
  }
  const row = raw as Record<string, unknown>
  for (const key of SCOPE_THUMBS_TYPES) {
    if (typeof row[key] === 'string') {
      out[key] = row[key]
    }
  }
  return out
}

export function mergeScopeThumbs(raw: unknown): ScopeThumbsSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_SCOPE_THUMBS, scopeIds: [], selected: [], directories: emptyDirectories() }
  }
  const row = raw as Record<string, unknown>
  const source = row.source ?? row.inputMode
  const type = isScopeThumbsType(row.type) ? row.type : DEFAULT_SCOPE_THUMBS.type
  const directories = mergeDirectories(row.directories)
  if (typeof row.directory === 'string') {
    directories[type] = row.directory
  }
  return {
    scopeIds: stringList(row.scopeIds ?? row.scope_ids),
    type,
    search: typeof row.search === 'string' ? row.search : DEFAULT_SCOPE_THUMBS.search,
    source: isScopeThumbsSource(source) ? source : DEFAULT_SCOPE_THUMBS.source,
    directory: directories[type],
    directories,
    selected: stringList(row.selected),
    skipExisting: row.skipExisting === true || row.skip_existing === true,
    applyAfter: row.applyAfter !== false && row.apply_after !== false,
  }
}

export function patchScopeThumbs(
  value: ScopeThumbsSettings,
  patch: Partial<ScopeThumbsSettings>,
): ScopeThumbsSettings {
  const prevType = isScopeThumbsType(value.type) ? value.type : DEFAULT_SCOPE_THUMBS.type
  const type = isScopeThumbsType(patch.type) ? patch.type : prevType
  const directories = { ...emptyDirectories(), ...value.directories, ...(patch.directories ?? {}) }
  if (value.directory && !directories[prevType]) {
    directories[prevType] = value.directory
  }
  const directory = 'directory' in patch ? (patch.directory ?? '') : directories[type]
  return mergeScopeThumbs({ ...value, ...patch, type, directory, directories })
}

export function posixPath(path: string) {
  return path.replace(/\\/g, '/')
}

function dirPrefixes(posix: string): string[] {
  const hash = posix.indexOf('#')
  const file = hash >= 0 ? posix.slice(0, hash) : posix
  const tag = hash >= 0 ? posix.slice(hash + 1) : ''
  const out: string[] = []
  let cut = file.lastIndexOf('/')
  while (cut > 0) {
    out.push(file.slice(0, cut))
    cut = file.slice(0, cut).lastIndexOf('/')
  }
  if (tag) {
    out.push(file)
    const parts = tag.split('/').filter(Boolean)
    let acc = ''
    for (const part of parts.slice(0, -1)) {
      acc = acc ? `${acc}/${part}` : part
      out.push(`${file}#${acc}`)
    }
  }
  return out
}

function dirLabel(dir: string) {
  const hash = dir.indexOf('#')
  if (hash < 0) {
    return dir
  }
  return `${dir.slice(0, hash)} · ${dir.slice(hash + 1)}`
}

export function modelDirOptions(paths: string[]): { value: string; label: string }[] {
  const dirs = new Set<string>()
  for (const path of paths) {
    for (const dir of dirPrefixes(posixPath(path))) {
      dirs.add(dir)
    }
  }
  const rows = [...dirs].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return [{ value: SCOPE_THUMBS_ROOT, label: '(all)' }, ...rows.map((dir) => ({ value: dir, label: dirLabel(dir) }))]
}

export function modelsUnderDir<T extends { path: string }>(items: T[], dir: string): T[] {
  const posixDir = posixPath(dir).replace(/\/+$/, '')
  if (!posixDir) {
    return []
  }
  if (posixDir === SCOPE_THUMBS_ROOT) {
    return items
  }
  return items.filter((item) => {
    const posix = posixPath(item.path)
    return posix === posixDir || posix.startsWith(`${posixDir}/`) || posix.startsWith(`${posixDir}#`)
  })
}

export function exclusiveScopeIds(
  current: string[],
  added: string,
  items: { id: string; group: string }[],
): string[] {
  const row = items.find((item) => item.id === added)
  const group = (row?.group || '').trim().toLowerCase()
  const kept = current.filter((id) => {
    if (id === added) {
      return false
    }
    if (!group) {
      return true
    }
    const other = items.find((item) => item.id === id)
    return (other?.group || '').trim().toLowerCase() !== group
  })
  return [...kept, added]
}

export function scopeThumbsContext(ids: string[]) {
  return contextKey(ids)
}

export function scopeThumbsTargetCount(raw: unknown): number {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return 0
  }
  const targets = (raw as { targets?: unknown }).targets
  if (!Array.isArray(targets)) {
    return 0
  }
  return targets.filter((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false
    }
    return Boolean(String((item as { path?: unknown }).path || '').trim())
  }).length
}

export function scopeThumbsTypeLabel(type: ScopeThumbsType) {
  return SCOPE_THUMBS_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type
}

function loraTag(item: Pick<ModelEntry, 'path' | 'strength'>) {
  return `<lora:${loraStem(item.path)}:${formatLoraStrength(item.strength ?? 1)}>`
}

function checkpointKind(
  path: string,
  checkpoints: ModelEntry[],
  diffusionModels: ModelEntry[],
): ScopeThumbTarget['kind'] {
  if (diffusionModels.some((item) => modelPath(item) === path)) {
    return 'diffusion_models'
  }
  if (checkpoints.some((item) => modelPath(item) === path)) {
    return 'checkpoints'
  }
  return 'checkpoints'
}

function hasScopeThumb(item: ModelEntry | undefined, global: boolean) {
  if (!item) {
    return false
  }
  return Boolean(global ? item.thumb_global : item.thumb_exact)
}

export function resolveScopeThumbTargets(args: {
  settings: ScopeThumbsSettings
  checkpoints: ModelEntry[]
  diffusionModels: ModelEntry[]
  loras: ModelEntry[]
  wildcards: ModelEntry[]
}): ScopeThumbTarget[] {
  const { settings } = args
  const baseModels = [...args.checkpoints, ...args.diffusionModels]
  let items: ModelEntry[] = []
  if (settings.type === 'checkpoints') {
    items = baseModels
  } else if (settings.type === 'loras') {
    items = args.loras
  } else {
    items = args.wildcards
  }
  const byPath = new Map(items.map((item) => [modelPath(item), item]))
  const paths =
    settings.source === 'directory'
      ? modelsUnderDir(items, settings.directory).map((item) => modelPath(item))
      : settings.selected.filter((path) => byPath.has(path))
  const out: ScopeThumbTarget[] = []
  const seen = new Set<string>()
  for (const path of paths) {
    if (!path || seen.has(path)) {
      continue
    }
    seen.add(path)
    const item = byPath.get(path)
    if (settings.skipExisting && hasScopeThumb(item, !settings.scopeIds.length)) {
      continue
    }
    if (settings.type === 'checkpoints') {
      out.push({ kind: checkpointKind(path, args.checkpoints, args.diffusionModels), path, tag: '' })
      continue
    }
    if (settings.type === 'loras') {
      out.push({ kind: 'loras', path, tag: item ? loraTag(item) : `<lora:${loraStem(path)}:1>` })
      continue
    }
    out.push({ kind: 'wildcards', path, tag: item ? wildcardTag(item) : `__${posixPath(path).replace(/\.[^/.]+$/, '')}__` })
  }
  return out
}
