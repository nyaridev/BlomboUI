export type CivitaiTab = {
  id: number
  name: string
  initialVersionId?: number
  versionId?: number
}

export function pickVersionId(
  versions: { id: number; baseModel?: string }[],
  preferredBases: string[],
) {
  for (const base of preferredBases) {
    const hit = versions.find((version) => version.baseModel === base)
    if (hit) {
      return hit.id
    }
  }
  return versions[0]?.id
}

export function civitaiModelHref(host: string, modelId: number, versionId?: number) {
  if (versionId) {
    return `https://${host}/models/${modelId}?modelVersionId=${versionId}`
  }
  return `https://${host}/models/${modelId}`
}

export function cleanCivitaiTabs(raw: unknown): CivitaiTab[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: CivitaiTab[] = []
  const seen = new Set<number>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const row = item as {
      id?: unknown
      name?: unknown
      initialVersionId?: unknown
      versionId?: unknown
    }
    const id = Number(row.id)
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) {
      continue
    }
    seen.add(id)
    const name = String(row.name || '').trim().slice(0, 200) || `Model ${id}`
    const initialVersionId = cleanVersionId(row.initialVersionId)
    const versionId = cleanVersionId(row.versionId)
    out.push({
      id,
      name,
      ...(initialVersionId === undefined ? {} : { initialVersionId }),
      ...(versionId === undefined ? {} : { versionId }),
    })
  }
  return out
}

function cleanVersionId(raw: unknown): number | undefined {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : undefined
}

export function cleanCivitaiTabId(raw: unknown, tabs: CivitaiTab[]) {
  if (raw === null || raw === undefined || raw === '') {
    return null
  }
  const id = Number(raw)
  if (!Number.isInteger(id)) {
    return null
  }
  return tabs.some((tab) => tab.id === id) ? id : null
}
