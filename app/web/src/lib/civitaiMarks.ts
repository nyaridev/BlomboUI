import type { CivitaiModel } from '@/lib/api.ts'

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

export type ModelMark = { id: string; text?: string; pony?: boolean; title: string }

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

function modelMark(raw: string): ModelMark | null {
  const value = raw.trim()
  if (!value) {
    return null
  }
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (key.includes('pony')) {
    return { id: 'pony', pony: true, title: value }
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
  return text ? { id: text, text, title: value } : null
}

export function modelMarks(item: CivitaiModel) {
  const values = item.baseModels?.length ? item.baseModels : item.baseModel ? [item.baseModel] : []
  const out: ModelMark[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const mark = modelMark(value)
    if (!mark || seen.has(mark.id)) {
      continue
    }
    seen.add(mark.id)
    out.push(mark)
  }
  return out
}
