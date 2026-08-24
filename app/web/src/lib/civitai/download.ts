export type CivitaiDownloadNaming = 'normal' | 'custom'

export type CivitaiDownloadSettings = {
  modelDirId: string
  wildcardDirId: string
  modelIntelligent: boolean
  modelSortBaseModel: boolean
  modelSortCategory: boolean
  modelSortCreator: boolean
  modelNaming: CivitaiDownloadNaming
  wildcardIntelligent: boolean
  wildcardUnpack: boolean
  updateModelInfo: boolean
  authorAliases: Record<string, string>
}

type DirectoryRef = { id: string }

export const CIVITAI_DOWNLOAD_DEFAULT: CivitaiDownloadSettings = {
  modelDirId: 'local',
  wildcardDirId: 'local',
  modelIntelligent: true,
  modelSortBaseModel: true,
  modelSortCategory: true,
  modelSortCreator: true,
  modelNaming: 'normal',
  wildcardIntelligent: true,
  wildcardUnpack: true,
  updateModelInfo: true,
  authorAliases: {},
}

function cleanDirectoryId(raw: unknown, dirs: DirectoryRef[] | undefined) {
  const id = typeof raw === 'string' ? raw.trim() : ''
  return id && (dirs || []).some((item) => item.id === id) ? id : 'local'
}

function cleanAliases(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const out: Record<string, string> = {}
  const used = new Set<string>()
  for (const [rawAuthor, rawAlias] of Object.entries(raw)) {
    const author = rawAuthor.trim().slice(0, 200)
    const alias = String(rawAlias || '').trim().slice(0, 80)
    const key = alias.toLowerCase()
    if (!author || !/^[A-Za-z0-9._-]+$/.test(alias) || used.has(key)) {
      continue
    }
    used.add(key)
    out[author] = alias
  }
  return out
}

export function cleanCivitaiDownload(
  raw: unknown,
  modelDirs?: DirectoryRef[],
  wildcardDirs?: DirectoryRef[],
): CivitaiDownloadSettings {
  const row = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    modelDirId: cleanDirectoryId(row.modelDirId, modelDirs),
    wildcardDirId: cleanDirectoryId(row.wildcardDirId, wildcardDirs),
    modelIntelligent: typeof row.modelIntelligent === 'boolean' ? row.modelIntelligent : true,
    modelSortBaseModel: typeof row.modelSortBaseModel === 'boolean' ? row.modelSortBaseModel : true,
    modelSortCategory: typeof row.modelSortCategory === 'boolean' ? row.modelSortCategory : true,
    modelSortCreator: typeof row.modelSortCreator === 'boolean' ? row.modelSortCreator : true,
    modelNaming: row.modelNaming === 'custom' ? 'custom' : 'normal',
    wildcardIntelligent: typeof row.wildcardIntelligent === 'boolean' ? row.wildcardIntelligent : true,
    wildcardUnpack: typeof row.wildcardUnpack === 'boolean' ? row.wildcardUnpack : true,
    updateModelInfo: typeof row.updateModelInfo === 'boolean' ? row.updateModelInfo : true,
    authorAliases: cleanAliases(row.authorAliases),
  }
}

export function authorAlias(aliases: Record<string, string>, author: string) {
  const needle = author.trim().toLowerCase()
  if (!needle) {
    return ''
  }
  const entry = Object.entries(aliases).find(([name]) => name.toLowerCase() === needle)
  return entry?.[1] || author
}

export function authorAliasConflict(
  aliases: Record<string, string>,
  author: string,
  candidate: string,
) {
  const value = candidate.trim().toLowerCase()
  if (!value) {
    return false
  }
  const owner = Object.entries(aliases).find(([, alias]) => alias.toLowerCase() === value)?.[0]
  return Boolean(owner && owner.toLowerCase() !== author.trim().toLowerCase())
}
