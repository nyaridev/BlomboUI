export type SafetensorsMeta = Record<string, unknown>

const MAX_HEADER = 32 * 1024 * 1024
const HASH = /^[0-9a-f]{8,64}$/i

export async function readSafetensorsMetadata(file: File): Promise<SafetensorsMeta> {
  const sizeBuf = await file.slice(0, 8).arrayBuffer()
  if (sizeBuf.byteLength < 8) {
    throw new Error('Not a valid safetensors file')
  }
  const view = new DataView(sizeBuf)
  const lo = view.getUint32(0, true)
  const hi = view.getUint32(4, true)
  if (hi !== 0 || lo === 0 || lo > MAX_HEADER) {
    throw new Error('Safetensors header is missing or too large')
  }
  const headerBuf = await file.slice(8, 8 + lo).arrayBuffer()
  let header: unknown
  try {
    header = JSON.parse(new TextDecoder().decode(headerBuf)) as unknown
  } catch {
    throw new Error('Could not parse safetensors header')
  }
  if (!header || typeof header !== 'object' || Array.isArray(header)) {
    return {}
  }
  const raw = (header as Record<string, unknown>).__metadata__
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: SafetensorsMeta = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') {
      try {
        out[key] = JSON.parse(value) as unknown
      } catch {
        out[key] = value
      }
    } else {
      out[key] = value
    }
  }
  return out
}

function normalizeHash(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  let hex = value.trim().toLowerCase()
  if (hex.startsWith('0x')) {
    hex = hex.slice(2)
  }
  return HASH.test(hex) ? hex : ''
}

export function embeddedHashes(meta: SafetensorsMeta): string[] {
  const out: string[] = []
  const model = normalizeHash(meta.sshs_model_hash)
  if (model.length >= 12) {
    out.push(model.slice(0, 12))
  }
  const spec = normalizeHash(meta['modelspec.hash_sha256'])
  if (spec) {
    out.push(spec)
    if (spec.length > 10) {
      out.push(spec.slice(0, 10))
    }
  }
  const legacy = normalizeHash(meta.sshs_legacy_hash)
  if (legacy) {
    out.push(legacy)
  }
  return [...new Set(out)]
}

const TRAINING_GROUPS: { title: string; wide?: boolean; keys: { key: string; label: string }[] }[] = [
  {
    title: 'Model',
    keys: [
      { key: 'ss_output_name', label: 'Output name' },
      { key: 'modelspec.title', label: 'Title' },
      { key: 'ss_base_model_version', label: 'Base model' },
      { key: 'modelspec.architecture', label: 'Architecture' },
      { key: 'ss_sd_model_name', label: 'SD model' },
    ],
  },
  {
    title: 'Network',
    keys: [
      { key: 'ss_network_module', label: 'Module' },
      { key: 'ss_network_dim', label: 'Dim / Rank' },
      { key: 'ss_network_alpha', label: 'Alpha' },
    ],
  },
  {
    title: 'Optimizer',
    keys: [
      { key: 'ss_learning_rate', label: 'Learning rate' },
      { key: 'ss_unet_lr', label: 'UNet LR' },
      { key: 'ss_text_encoder_lr', label: 'Text encoder LR' },
      { key: 'ss_optimizer', label: 'Optimizer' },
      { key: 'ss_lr_scheduler', label: 'Scheduler' },
    ],
  },
  {
    title: 'Run',
    wide: true,
    keys: [
      { key: 'ss_epoch', label: 'Epoch' },
      { key: 'ss_steps', label: 'Steps' },
      { key: 'ss_num_train_images', label: 'Train images' },
      { key: 'ss_num_batches_per_epoch', label: 'Batches / epoch' },
      { key: 'ss_batch_size_per_device', label: 'Batch size' },
      { key: 'ss_batch_size', label: 'Batch size' },
      { key: 'ss_resolution', label: 'Resolution' },
    ],
  },
  {
    title: 'Other',
    keys: [
      { key: 'ss_clip_skip', label: 'Clip skip' },
      { key: 'ss_mixed_precision', label: 'Mixed precision' },
      { key: 'sshs_model_hash', label: 'AutoV3 hash' },
      { key: 'modelspec.hash_sha256', label: 'ModelSpec SHA256' },
    ],
  },
]

function cellValue(value: unknown): string {
  if (value == null || value === '') {
    return ''
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

function scalar(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function ofField(label: string, current: string, max: string): TrainingField | null {
  if (current && max) {
    return { label, current, max }
  }
  const value = current || max
  return value ? { label, value } : null
}

export type TrainingField = {
  label: string
  value?: string
  current?: string
  max?: string
}

export type TrainingGroup = {
  title: string
  wide?: boolean
  fields: TrainingField[]
}

export type TagCount = { tag: string; count: number }

export function tagFrequency(meta: SafetensorsMeta, limit = 5): TagCount[] {
  const raw = meta.ss_tag_frequency ?? meta.tag_frequency
  const counts = new Map<string, number>()
  function walk(node: unknown) {
    const row = asRecord(node)
    if (!row) {
      return
    }
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        counts.set(key, (counts.get(key) || 0) + value)
      } else {
        walk(value)
      }
    }
  }
  walk(raw)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }))
}

function dimRank(meta: SafetensorsMeta): TrainingField | null {
  const dim = scalar(meta.ss_network_dim)
  const rank = scalar(meta.ss_network_rank) || dim
  if (dim && rank) {
    return { label: 'Dim / Rank', value: `${dim}/${rank}` }
  }
  if (dim) {
    return { label: 'Dim', value: dim }
  }
  if (rank) {
    return { label: 'Rank', value: rank }
  }
  return null
}

function epochField(meta: SafetensorsMeta): TrainingField | null {
  return ofField('Epoch', scalar(meta.ss_epoch), scalar(meta.ss_num_epochs) || scalar(meta.ss_max_train_epochs))
}

function stepsField(meta: SafetensorsMeta): TrainingField | null {
  const info = asRecord(meta.training_info) || {}
  const current = scalar(info.step) || scalar(meta.ss_num_train_steps)
  const max = scalar(meta.ss_max_train_steps) || scalar(meta.ss_steps)
  return ofField('Steps', current, max)
}

export function trainingGroups(meta: SafetensorsMeta): TrainingGroup[] {
  const out: TrainingGroup[] = []
  for (const group of TRAINING_GROUPS) {
    const fields: TrainingField[] = []
    for (const { key, label } of group.keys) {
      if (key === 'ss_network_dim') {
        const field = dimRank(meta)
        if (field) {
          fields.push(field)
        }
        continue
      }
      if (key === 'ss_epoch') {
        const field = epochField(meta)
        if (field) {
          fields.push(field)
        }
        continue
      }
      if (key === 'ss_steps') {
        const field = stepsField(meta)
        if (field) {
          fields.push(field)
        }
        continue
      }
      if (key === 'ss_batch_size' && fields.some((item) => item.label === 'Batch size')) {
        continue
      }
      const value = cellValue(meta[key])
      if (value) {
        fields.push({ label, value })
      }
    }
    if (fields.length) {
      out.push({ title: group.title, wide: group.wide, fields })
    }
  }
  return out
}
