import type { CivitaiModel, CivitaiModelFile, ModelEntry } from '@/lib/api.ts'

function cleanName(value: string) {
  const name = value.replace(/\\/g, '/').split('/').pop() || value
  return name
    .replace(/\.(safetensors|ckpt|pt|pth|sft|bin)$/i, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanHash(value: string) {
  return value.trim().toLowerCase().replace(/^0x/, '')
}

export function isCivitaiModelDownloaded(item: CivitaiModel, local: ModelEntry[]) {
  const localHashes = new Set(
    local.flatMap((entry) =>
      Object.values(entry.hashes || {})
        .map((value) => cleanHash(value))
        .filter(Boolean),
    ),
  )
  if ((item.downloadHashes || []).some((value) => localHashes.has(cleanHash(value)))) {
    return true
  }

  const localNames = new Set(
    local.flatMap((entry) => [entry.path, entry.source || '', entry.label || '', entry.tag || ''].map(cleanName)).filter(Boolean),
  )
  const names = item.downloadNames?.length ? item.downloadNames : [item.name]
  return names.map(cleanName).filter(Boolean).some((name) => localNames.has(name))
}

export function isCivitaiFileDownloaded(file: CivitaiModelFile, local: ModelEntry[]) {
  const localHashes = new Set(
    local.flatMap((entry) =>
      Object.values(entry.hashes || {})
        .map((value) => cleanHash(value))
        .filter(Boolean),
    ),
  )
  if (Object.values(file.hashes || {}).some((value) => localHashes.has(cleanHash(value)))) {
    return true
  }
  const name = cleanName(file.name)
  return Boolean(name && local.some((entry) => cleanName(entry.path) === name))
}
