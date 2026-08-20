import type { TemplateParams } from '@/stores/generateStore.ts'
import { PARAM_KEYS, pickParams } from '@/stores/generateStore.ts'

export type PngLora = {
  name: string
  strength?: number
  hash?: string
}

export type PngInfoParams = Partial<TemplateParams> & {
  modelHash?: string
  autov1?: string
  autov3?: string
  sha256?: string
  loras?: PngLora[]
  interrupted?: boolean
}

const HEX_HASH = /^[0-9a-f]{8,64}$/i

export function pngModelHashes(parsed: PngInfoParams): string[] {
  return [...new Set([parsed.autov3, parsed.modelHash, parsed.autov1, parsed.sha256].filter((value): value is string => Boolean(value)))]
}

export function pngLoraHashes(parsed: PngInfoParams): string[] {
  return [...new Set((parsed.loras || []).map((item) => item.hash).filter((value): value is string => Boolean(value)))]
}

const SETTINGS = /^Steps:/i
const NEGATIVE = /^Negative prompt:/i
const GENERATED = /^Generated using /i
const LORA_LINE = /^(Lora hashes|Lora weights|Loras):/i

export function parsePngInfo(text: string): PngInfoParams {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  const prompt: string[] = []
  while (i < lines.length && !NEGATIVE.test(lines[i]) && !SETTINGS.test(lines[i]) && !GENERATED.test(lines[i])) {
    prompt.push(lines[i])
    i += 1
  }
  const out: PngInfoParams = {}
  const promptText = prompt.join('\n').trim()
  if (promptText) {
    out.prompt = promptText
  }
  if (i < lines.length && NEGATIVE.test(lines[i])) {
    const neg = [lines[i].replace(NEGATIVE, '').trim()]
    i += 1
    while (i < lines.length && !SETTINGS.test(lines[i]) && !GENERATED.test(lines[i])) {
      neg.push(lines[i])
      i += 1
    }
    out.negativePrompt = neg.join('\n').trim()
  }
  if (i < lines.length && SETTINGS.test(lines[i])) {
    applySettings(out, lines[i])
    applyLoraHashes(out, lines[i])
    i += 1
    while (i < lines.length && LORA_LINE.test(lines[i])) {
      applyLoraLine(out, lines[i])
      i += 1
    }
  }
  return out
}

function applySettings(out: PngInfoParams, line: string) {
  const fields: Record<string, string> = {}
  for (const chunk of line.split(', ')) {
    const split = chunk.indexOf(':')
    if (split < 0) {
      continue
    }
    fields[chunk.slice(0, split).trim().toLowerCase()] = chunk.slice(split + 1).trim()
  }
  const steps = intIn(fields.steps, 1, 150)
  if (steps != null) {
    out.steps = steps
  }
  if (fields.sampler) {
    out.sampler = fields.sampler
  }
  if (fields.scheduler) {
    out.scheduler = fields.scheduler
  }
  const cfg = floatIn(fields['cfg scale'] ?? fields.cfg, 1, 30)
  if (cfg != null) {
    out.cfg = cfg
  }
  const seed = intRaw(fields.seed)
  if (seed != null) {
    out.seed = seed
  }
  const size = fields.size?.match(/^(\d+)\s*x\s*(\d+)$/i)
  if (size) {
    const width = intIn(size[1], 64, 4096)
    const height = intIn(size[2], 64, 4096)
    if (width != null && height != null) {
      out.width = width
      out.height = height
      out.resMode = 'raw'
    }
  }
  if (fields.model) {
    out.checkpoint = fields.model
  }
  const modelHash = hexHash(fields['model hash'] || fields.autov2)
  if (modelHash) {
    out.modelHash = modelHash
  }
  const autov1 = hexHash(fields.autov1)
  if (autov1) {
    out.autov1 = autov1
  }
  const autov3 = hexHash(fields.autov3)
  if (autov3) {
    out.autov3 = autov3
  }
  const sha256 = hexHash(fields.sha256)
  if (sha256) {
    out.sha256 = sha256
  }
  const batchSize = intIn(fields['batch size'], 1, 8)
  if (batchSize != null) {
    out.batchSize = batchSize
  }
  const batchCount = intIn(fields['batch count'], 1, 100)
  if (batchCount != null) {
    out.batchCount = batchCount
  }
  if (/^(true|yes|1)$/i.test(fields.interrupted || '')) {
    out.interrupted = true
  }
}

function parseNamedPairs(value: string): [string, string][] {
  const out: [string, string][] = []
  for (const chunk of value.split(', ')) {
    const split = chunk.indexOf(':')
    if (split < 0) {
      continue
    }
    const name = chunk.slice(0, split).trim()
    const rest = chunk.slice(split + 1).trim()
    if (name && rest) {
      out.push([name, rest])
    }
  }
  return out
}

function mergeLora(out: PngInfoParams, name: string, patch: { hash?: string; strength?: number }) {
  if (!out.loras) {
    out.loras = []
  }
  let item = out.loras.find((row) => row.name === name)
  if (!item) {
    item = { name }
    out.loras.push(item)
  }
  if (patch.hash) {
    item.hash = patch.hash
  }
  if (patch.strength != null) {
    item.strength = patch.strength
  }
}

function applyLoraHashes(out: PngInfoParams, text: string) {
  const match = text.match(/Lora hashes:\s*(.*)$/i)
  if (!match) {
    return
  }
  for (const [name, rest] of parseNamedPairs(match[1])) {
    const hash = hexHash(rest)
    if (hash) {
      mergeLora(out, name, { hash })
    }
  }
}

function applyLoraLine(out: PngInfoParams, line: string) {
  const split = line.indexOf(':')
  if (split < 0) {
    return
  }
  const key = line.slice(0, split).trim().toLowerCase()
  const value = line.slice(split + 1).trim()
  if (key === 'lora hashes') {
    applyLoraHashes(out, line)
    return
  }
  if (key === 'lora weights') {
    for (const [name, rest] of parseNamedPairs(value)) {
      const n = Number(rest)
      if (Number.isFinite(n)) {
        mergeLora(out, name, { strength: n })
      }
    }
    return
  }
  if (key !== 'loras') {
    return
  }
  for (const [name, rest] of parseNamedPairs(value)) {
    const bits = rest.split(':').map((bit) => bit.trim()).filter(Boolean)
    const patch: { hash?: string; strength?: number } = {}
    for (const bit of bits) {
      const hash = hexHash(bit)
      if (hash) {
        patch.hash = hash
        continue
      }
      const n = Number(bit)
      if (Number.isFinite(n)) {
        patch.strength = n
      }
    }
    if (patch.hash || patch.strength != null) {
      mergeLora(out, name, patch)
    }
  }
}

export function applyPngInfo(
  current: TemplateParams,
  parsed: PngInfoParams,
  allowed: Set<string>,
  choices: { samplers: string[]; schedulers: string[] },
): TemplateParams {
  const next = pickParams(current)
  for (const key of PARAM_KEYS) {
    const value = parsed[key]
    if (value === undefined || !allowed.has(key)) {
      continue
    }
    if (key === 'sampler' && typeof value === 'string') {
      const matched = matchList(value, choices.samplers)
      if (!matched) {
        continue
      }
      next.sampler = matched
      continue
    }
    if (key === 'scheduler' && typeof value === 'string') {
      const matched = matchList(value, choices.schedulers)
      if (!matched) {
        continue
      }
      next.scheduler = matched
      continue
    }
    if (!validParam(key, value, choices)) {
      continue
    }
    ;(next as Record<string, unknown>)[key] = value
    if (key === 'width' || key === 'height') {
      next.resMode = 'raw'
    }
  }
  next.cfg = Math.max(1, next.cfg)
  return next
}

function validParam(key: keyof TemplateParams, value: unknown, choices: { samplers: string[]; schedulers: string[] }) {
  if (key === 'prompt' || key === 'negativePrompt') {
    return typeof value === 'string'
  }
  if (key === 'checkpoint') {
    return typeof value === 'string' && value.trim() !== ''
  }
  if (key === 'sampler') {
    return typeof value === 'string' && inList(value, choices.samplers)
  }
  if (key === 'scheduler') {
    return typeof value === 'string' && inList(value, choices.schedulers)
  }
  if (key === 'steps') {
    return intIn(value, 1, 150) != null
  }
  if (key === 'cfg') {
    return floatIn(value, 1, 30) != null
  }
  if (key === 'width' || key === 'height') {
    return intIn(value, 64, 4096) != null
  }
  if (key === 'seed') {
    return intRaw(value) != null
  }
  if (key === 'seedAfter') {
    return value === 'randomize' || value === 'fixed' || value === 'increment' || value === 'decrement'
  }
  if (key === 'batchSize') {
    return intIn(value, 1, 8) != null
  }
  if (key === 'batchCount') {
    return intIn(value, 1, 100) != null
  }
  if (key === 'resMode') {
    return value === 'raw' || value === 'scaler'
  }
  if (key === 'outputImagePath' || key === 'outputGridPath' || key === 'outputImageName' || key === 'outputGridName') {
    return typeof value === 'string'
  }
  return false
}

function matchList(value: string, items: string[]) {
  const needle = value.toLowerCase()
  return items.find((item) => item.toLowerCase() === needle) ?? null
}

function inList(value: string, items: string[]) {
  return matchList(value, items) != null
}

function intRaw(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isInteger(n) || !Number.isSafeInteger(n)) {
    return null
  }
  return n
}

function intIn(value: unknown, min: number, max: number): number | null {
  const n = intRaw(value)
  if (n == null || n < min || n > max) {
    return null
  }
  return n
}

function hexHash(value: string | undefined): string {
  const hex = (value || '').trim().toLowerCase()
  return HEX_HASH.test(hex) ? hex : ''
}

function floatIn(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim())
  if (!Number.isFinite(n) || n < min || n > max) {
    return null
  }
  return n
}
