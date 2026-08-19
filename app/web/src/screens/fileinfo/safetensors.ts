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
      { key: 'ss_network_dim', label: 'Dim' },
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
      { key: 'ss_max_train_epochs', label: 'Max epochs' },
      { key: 'ss_num_epochs', label: 'Epochs' },
      { key: 'ss_epoch', label: 'Epoch' },
      { key: 'ss_max_train_steps', label: 'Max steps' },
      { key: 'ss_num_train_steps', label: 'Train steps' },
      { key: 'ss_steps', label: 'Steps' },
      { key: 'ss_num_train_images', label: 'Train images' },
      { key: 'ss_num_batches_per_epoch', label: 'Batches / epoch' },
      { key: 'ss_batch_size_per_device', label: 'Batch size' },
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

export type TrainingGroup = {
  title: string
  wide?: boolean
  fields: { label: string; value: string }[]
}

export function trainingGroups(meta: SafetensorsMeta): TrainingGroup[] {
  const out: TrainingGroup[] = []
  for (const group of TRAINING_GROUPS) {
    const fields: TrainingGroup['fields'] = []
    for (const { key, label } of group.keys) {
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
