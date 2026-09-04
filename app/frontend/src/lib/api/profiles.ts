import { api, readError } from './http.ts'

export type ProfileInfo = {
  id: string
  displayName: string
  locked?: boolean
  active?: boolean
}

export type RemovedProfile = {
  id: string
  displayName: string
  removedAt: number
  expiresAt: number
}

export type ProfilesPayload = {
  activeId: string
  profiles: ProfileInfo[]
  removed?: RemovedProfile[]
}

const PROFILE_KEY = 'blombo-active-profile'
const GENERATE_KEY = 'blombo-generate'
const GENERATE_PERSIST_DELAY = 300

let persistTimer: number | null = null
let pendingPersist: { key: string; value: string } | null = null
let persistFlushBound = false

function persistNow(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function flushGeneratePersist() {
  if (persistTimer != null) {
    window.clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!pendingPersist) {
    return
  }
  persistNow(pendingPersist.key, pendingPersist.value)
  pendingPersist = null
}

function bindPersistFlush() {
  if (persistFlushBound || typeof window === 'undefined') {
    return
  }
  persistFlushBound = true
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushGeneratePersist()
    }
  })
  window.addEventListener('pagehide', flushGeneratePersist)
  window.addEventListener('beforeunload', flushGeneratePersist)
}

export function storedProfileId(): string {
  try {
    return localStorage.getItem(PROFILE_KEY) || 'default'
  } catch {
    return 'default'
  }
}

export function rememberProfileId(id: string): void {
  try {
    localStorage.setItem(PROFILE_KEY, id)
  } catch {
    /* ignore */
  }
}

export function generatePersistKey(): string {
  return `${GENERATE_KEY}:${storedProfileId()}`
}

export function readGeneratePersist(): string | null {
  try {
    const key = generatePersistKey()
    let raw = localStorage.getItem(key)
    if (raw == null && storedProfileId() === 'default') {
      raw = localStorage.getItem(GENERATE_KEY)
      if (raw != null) {
        localStorage.setItem(key, raw)
      }
    }
    return raw
  } catch {
    return null
  }
}

export function writeGeneratePersist(value: string): void {
  bindPersistFlush()
  pendingPersist = { key: generatePersistKey(), value }
  if (persistTimer != null) {
    window.clearTimeout(persistTimer)
  }
  persistTimer = window.setTimeout(() => {
    persistTimer = null
    flushGeneratePersist()
  }, GENERATE_PERSIST_DELAY)
}

export function removeGeneratePersist(): void {
  if (persistTimer != null) {
    window.clearTimeout(persistTimer)
    persistTimer = null
  }
  pendingPersist = null
  try {
    localStorage.removeItem(generatePersistKey())
  } catch {
    /* ignore */
  }
}

export async function getProfiles(): Promise<ProfilesPayload> {
  const res = await fetch(api('/profiles'))
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ProfilesPayload
}

export async function createProfile(displayName: string): Promise<ProfileInfo> {
  const res = await fetch(api('/profiles'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ProfileInfo
}

export async function renameProfile(id: string, displayName: string): Promise<ProfileInfo> {
  const res = await fetch(api(`/profiles/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ProfileInfo
}

export async function deleteProfile(id: string): Promise<void> {
  const res = await fetch(api(`/profiles/${encodeURIComponent(id)}`), { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function restoreProfile(id: string): Promise<ProfileInfo> {
  const res = await fetch(api(`/profiles/${encodeURIComponent(id)}/restore`), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ProfileInfo
}

export async function purgeProfile(id: string): Promise<void> {
  const res = await fetch(api(`/profiles/${encodeURIComponent(id)}/purge`), { method: 'DELETE' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
}

export async function activateProfile(id: string): Promise<ProfilesPayload> {
  rememberProfileId(id)
  const res = await fetch(api(`/profiles/${encodeURIComponent(id)}/activate`), { method: 'POST' })
  if (!res.ok) {
    throw new Error(await readError(res))
  }
  return (await res.json()) as ProfilesPayload
}
