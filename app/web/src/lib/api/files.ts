import { api, readError } from './http.ts'

export type PngInfoResult = {
  text: string
  raw: Record<string, string>
  metadata: Record<string, unknown>
}

export async function readPngInfo(file: File): Promise<PngInfoResult> {
  const res = await fetch(api('/pnginfo'), {
    method: 'POST',
    headers: { 'X-Filename': file.name },
    body: file,
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  const data = (await res.json()) as {
    text?: string
    raw?: Record<string, string>
    metadata?: Record<string, unknown>
  }
  const raw = data.raw && typeof data.raw === 'object' ? data.raw : {}
  const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {}
  return { text: data.text || 'No generation metadata found.', raw, metadata }
}
