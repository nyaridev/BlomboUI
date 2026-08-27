import { api, readError } from './http.ts'

export type ManagerModel = {
  name: string
  type: string
  base: string
  save_path: string
  description: string
  reference: string
  filename: string
  size: string
  installed: 'True' | 'False'
}

export async function listManagerModels(mode = 'cache'): Promise<ManagerModel[]> {
  const res = await fetch(api(`/manager/models?mode=${encodeURIComponent(mode)}`))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as { models?: ManagerModel[] }
  return Array.isArray(data.models) ? data.models : []
}

export async function installManagerModel(item: Pick<ManagerModel, 'name' | 'filename' | 'save_path'>): Promise<void> {
  const res = await fetch(api('/manager/models/install'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: item.name, filename: item.filename, save_path: item.save_path }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}
