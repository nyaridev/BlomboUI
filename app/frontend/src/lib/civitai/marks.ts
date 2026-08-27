import { parseGlyphOrNull, type Glyph } from '@/components/composites/chrome/glyph.ts'
import type { CivitaiModel } from '@/lib/api.ts'
import { matchModelType, MODEL_TYPES } from '@/lib/modelTypes.ts'

const MODEL_CODES: Record<string, string> = {
  illustrious: 'IL',
  noobai: 'NB',
  krea: 'KR',
  krea2: 'K2',
  sd14: 'SD1',
  sd15: 'SD1',
  sd15lcm: 'SD1',
  sd15hyper: 'SD1',
  sd20: 'SD2',
  sd21: 'SD2',
  sdxl: 'XL',
  sdxl10: 'XL',
  sdxl09: 'XL',
  sdxllightning: 'XL',
  sdxlhyper: 'XL',
  flux1d: 'F1D',
  flux1s: 'F1S',
  flux1krea: 'F1K',
  wanvideo13bt2v: 'W13BT2',
  wanvideo14bt2v: 'W14BT2',
  wanvideo14bi2v480p: 'W14BI2',
  wanvideo14bi2v720p: 'W14BI2',
  wanvideo22ti2v5b: 'W22TI5',
  wanvideo22i2va14b: 'W22I14',
  wanvideo22t2va14b: 'W22T14',
  wanvideo25t2v: 'W25T2',
  wanvideo25i2v: 'W25I2',
  wanimage27: 'WI27',
  wanvideo27: 'W27',
}

const NAME_MAX = 80
const TEXT_MAX = 12

export const PONY_ICON: Glyph = { kind: 'icon', id: 'horse-head', color: 'ink' }

export type CivitaiMarkEntry = { text: string; icon?: Glyph }
export type CivitaiMarks = Record<string, CivitaiMarkEntry>
export type ModelMark = { id: string; title: string; text?: string; icon?: Glyph }

function wanCode(raw: string) {
  const image = /image/i.test(raw)
  const body = raw.replace(/^wan\s*(video|image)\s*/i, '').replace(/\b\d{3,4}p\b/gi, '')
  const mode = (body.match(/\b(ti2v|t2v|i2v)\b/i)?.[1] || '')
    .toUpperCase()
    .replace('TI2V', 'TI2')
    .replace('T2V', 'T2')
    .replace('I2V', 'I2')
  const nums = body.match(/(\d+(?:\.\d+)?)B?/gi) || []
  const bits = nums.map((item) => item.replace('.', '').toUpperCase())
  if (bits.length <= 1) {
    return ('W' + (image ? 'I' : '') + (bits[0] || '') + mode).toUpperCase()
  }
  const ver = bits[0].replace(/B$/, '')
  const size = (bits[1] || '').replace(/B$/, '')
  return ('W' + ver + mode.replace(/2$/, '') + size).toUpperCase()
}

function modelMark(raw: string): { text: string; pony: boolean } | null {
  const value = raw.trim()
  if (!value) {
    return null
  }
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (key.includes('pony')) {
    return { text: 'PONY', pony: true }
  }
  let text = ''
  if (key.includes('illustrious')) {
    text = 'IL'
  } else if (key.includes('noobai')) {
    text = 'NB'
  } else if (key.includes('sdxl')) {
    text = 'XL'
  } else if (key.includes('sd15') || key.includes('sd14') || /^sd1/.test(key)) {
    text = 'SD1'
  } else if (MODEL_CODES[key]) {
    text = MODEL_CODES[key]
  } else if (key.startsWith('wan')) {
    text = wanCode(value)
  } else {
    const parts = value.match(/[a-z]+|\d+/gi) || [value]
    text = parts
      .map((part) => (/^\d+$/.test(part) ? part : part.slice(0, 1)))
      .join('')
      .toUpperCase()
      .slice(0, 6)
  }
  return text ? { text, pony: false } : null
}

export function markEntryFor(name: string): CivitaiMarkEntry | null {
  const mark = modelMark(name)
  if (!mark) {
    return null
  }
  if (mark.pony) {
    return { text: mark.text, icon: { ...PONY_ICON } }
  }
  return { text: mark.text }
}

export function defaultCivitaiMarks(): CivitaiMarks {
  const out: CivitaiMarks = {}
  for (const name of MODEL_TYPES) {
    const entry = markEntryFor(name)
    if (entry) {
      out[name] = entry
    }
  }
  return out
}

function inkIcon(value: Glyph): Glyph {
  return value.kind === 'icon' ? { kind: 'icon', id: value.id, color: 'ink' } : value
}

export function cleanCivitaiMarks(raw: unknown): CivitaiMarks {
  const out = defaultCivitaiMarks()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return out
  }
  for (const [name, item] of Object.entries(raw as Record<string, unknown>)) {
    const key = name.trim().slice(0, NAME_MAX)
    if (!key || !item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const row = item as Record<string, unknown>
    const text = typeof row.text === 'string' ? row.text.trim().slice(0, TEXT_MAX) : ''
    const parsed = parseGlyphOrNull(row.icon)
    out[key] = parsed ? { text, icon: inkIcon(parsed) } : { text }
  }
  return out
}

export function missingMarkNames(names: string[], table: CivitaiMarks): CivitaiMarks {
  const extra: CivitaiMarks = {}
  for (const raw of names) {
    const value = raw.trim()
    if (!value) {
      continue
    }
    const key = matchModelType(value) || value
    if (key in table || key in extra) {
      continue
    }
    const entry = markEntryFor(value)
    if (entry) {
      extra[key] = entry
    }
  }
  return extra
}

export function markNamesFromModels(
  items: { baseModel?: string; baseModels?: string[]; versions?: { baseModel?: string }[] }[],
) {
  const names: string[] = []
  for (const item of items) {
    if (item.baseModels?.length) {
      names.push(...item.baseModels)
    } else if (item.baseModel) {
      names.push(item.baseModel)
    }
    for (const version of item.versions || []) {
      if (version.baseModel) {
        names.push(version.baseModel)
      }
    }
  }
  return names
}

function entryFor(name: string, table: CivitaiMarks): CivitaiMarkEntry | null {
  const value = name.trim()
  if (!value) {
    return null
  }
  const key = matchModelType(value) || value
  return table[key] || table[value] || markEntryFor(value)
}

export function modelMarks(item: CivitaiModel, table: CivitaiMarks) {
  const values = item.baseModels?.length ? item.baseModels : item.baseModel ? [item.baseModel] : []
  const out: ModelMark[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const entry = entryFor(value, table)
    if (!entry || (!entry.icon && !entry.text)) {
      continue
    }
    const id = entry.icon ? `icon:${entry.icon.kind}:${entry.icon.id}` : `text:${entry.text}`
    if (seen.has(id)) {
      continue
    }
    seen.add(id)
    out.push({
      id,
      title: value,
      text: entry.icon ? undefined : entry.text,
      icon: entry.icon,
    })
  }
  return out
}
