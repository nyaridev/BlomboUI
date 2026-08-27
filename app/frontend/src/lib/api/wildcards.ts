import { api, readError } from './http.ts'

export type AutocompleteCsv = {
  name: string
  size: number
  downloaded: boolean
}

export async function getAutocompleteCsv(): Promise<AutocompleteCsv[]> {
  const res = await fetch(api('/autocomplete/csv'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { files?: AutocompleteCsv[] }
  return Array.isArray(data.files) ? data.files : []
}

export async function downloadAutocompleteCsv(name: string): Promise<AutocompleteCsv> {
  const res = await fetch(api('/autocomplete/csv'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as AutocompleteCsv
}

export async function openAutocompleteFolder(): Promise<void> {
  const res = await fetch(api('/autocomplete/open'), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export type PromptTagHit = {
  tag: string
  posts: number
  count: number
  favorite: boolean
  alias?: string
}

export async function suggestPromptTags(
  q: string,
  checkpoint: string,
  signal?: AbortSignal,
): Promise<{ tags: PromptTagHit[]; ready: boolean }> {
  const res = await fetch(
    api(`/autocomplete/suggest?q=${encodeURIComponent(q)}&checkpoint=${encodeURIComponent(checkpoint)}`),
    { signal },
  )
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { tags?: PromptTagHit[]; ready?: boolean }
  return {
    tags: Array.isArray(data.tags) ? data.tags : [],
    ready: data.ready !== false,
  }
}

export type FrequentPromptTag = {
  tag: string
  count: number
  favorite: boolean
}

export async function getPromptTagUsage(prefix: string, signal?: AbortSignal): Promise<FrequentPromptTag[]> {
  const res = await fetch(api(`/autocomplete/usage?prefix=${encodeURIComponent(prefix)}`), { signal })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { tags?: FrequentPromptTag[] }
  return Array.isArray(data.tags) ? data.tags : []
}

export async function getFrequentPromptTags(): Promise<{ tags: FrequentPromptTag[]; threshold: number }> {
  const res = await fetch(api('/autocomplete/frequent'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { tags?: FrequentPromptTag[]; threshold?: number }
  return {
    tags: Array.isArray(data.tags) ? data.tags : [],
    threshold: typeof data.threshold === 'number' ? data.threshold : 2,
  }
}

export type WildcardTreeNode = {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: WildcardTreeNode[]
}

export type YamlNode = { [key: string]: YamlNode } | string[]

export type WildcardFile = {
  path: string
  format: 'txt' | 'yaml'
  lines?: string[]
  tree?: Record<string, YamlNode>
  error?: string
  text?: string
}

export async function getWildcardTree(): Promise<WildcardTreeNode[]> {
  const res = await fetch(api('/user-wildcards/tree'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { roots?: WildcardTreeNode[] }
  return Array.isArray(data.roots) ? data.roots : []
}

export async function getWildcardFile(path: string): Promise<WildcardFile> {
  const res = await fetch(api(`/user-wildcards/file?path=${encodeURIComponent(path)}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as WildcardFile
}

export async function saveWildcardFile(
  path: string,
  body: { lines?: string[]; tree?: Record<string, YamlNode>; text?: string },
): Promise<WildcardFile> {
  const res = await fetch(api(`/user-wildcards/file?path=${encodeURIComponent(path)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as WildcardFile
}

export async function createWildcardFile(folder: string, name: string): Promise<WildcardFile> {
  const res = await fetch(api('/user-wildcards/file'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, name }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as WildcardFile
}

export async function createWildcardFolder(folder: string, name: string): Promise<{ path: string; kind: 'dir' }> {
  const res = await fetch(api('/user-wildcards/folder'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, name }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { path: string; kind: 'dir' }
}

export async function revealWildcardFile(path: string): Promise<void> {
  const res = await fetch(api('/user-wildcards/open'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function moveWildcardEntry(path: string, folder: string): Promise<{ path: string; kind: 'dir' | 'file' }> {
  const res = await fetch(api('/user-wildcards/move'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, folder }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { path: string; kind: 'dir' | 'file' }
}

export async function renameWildcardEntry(path: string, name: string): Promise<{ path: string; kind: 'dir' | 'file' }> {
  const res = await fetch(api('/user-wildcards/rename'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, name }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { path: string; kind: 'dir' | 'file' }
}

export async function formatWildcardYaml(body: {
  tree?: Record<string, YamlNode>
  text?: string
}): Promise<{ tree?: Record<string, YamlNode>; text?: string; error?: string }> {
  const res = await fetch(api('/user-wildcards/format'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as { tree?: Record<string, YamlNode>; text?: string; error?: string }
}
