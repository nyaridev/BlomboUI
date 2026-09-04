import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { ConfirmDialog } from '@/components/controls/dialog/Dialog.tsx'
import { NameDialog } from '@/components/controls/dialog/NameDialog.tsx'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import {
  activateProfile,
  createProfile,
  deleteProfile,
  getProfiles,
  purgeProfile,
  renameProfile,
  restartApp,
  restoreProfile,
  type ProfileInfo,
  type RemovedProfile,
} from '@/lib/api.ts'
import { SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { useEffect, useState } from 'react'

export const PROFILES_QUERY =
  'profiles profile switch restart user workspace default trash removed restore expire 72 hours'

const ROW = 'flex items-center gap-1.5 rounded-md border border-line bg-panel p-1.5'
const NAME =
  'box-border flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded border border-line bg-field px-2 text-sm leading-[1.875rem] text-ink'

const RETAIN_MS = 72 * 3600 * 1000

function remainingLabel(expiresAt: number, now: number) {
  const ms = Math.max(0, Math.min(RETAIN_MS, expiresAt * 1000 - now))
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

export function ProfilesSection({ query = '' }: { query?: string }) {
  const [items, setItems] = useState<ProfileInfo[]>([])
  const [removed, setRemoved] = useState<RemovedProfile[]>([])
  const [activeId, setActiveId] = useState('default')
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [rename, setRename] = useState<ProfileInfo | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [remove, setRemove] = useState<ProfileInfo | null>(null)
  const [purge, setPurge] = useState<RemovedProfile | null>(null)
  const [pending, setPending] = useState<ProfileInfo | null>(null)
  const [now, setNow] = useState(() => Date.now())

  async function refresh() {
    const data = await getProfiles()
    setItems(data.profiles)
    setRemoved(data.removed ?? [])
    setActiveId(data.activeId)
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not load profiles')
    })
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const taken = items.map((item) => item.displayName)

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Profiles" terms={PROFILES_QUERY}>
        <p className="text-xs text-muted">
          Each profile has its own settings, gallery, templates, and output folder. Switching a profile restarts the
          app. Models, wildcards, and autocomplete files stay shared.
        </p>
        {error ? <p className="text-xs text-accent">{error}</p> : null}
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              aria-current={item.id === activeId ? 'true' : undefined}
              className={ROW}
            >
              <span className={NAME}>
                <span className="min-w-0 truncate">{item.displayName}</span>
                {item.id === activeId ? <span className="shrink-0 text-muted">Active</span> : null}
              </span>
              {item.id !== activeId ? (
                <IconButton className="shrink-0" aria-label="Switch" title="Switch" onClick={() => setPending(item)}>
                  <AppIcon id="refresh-cw" />
                </IconButton>
              ) : null}
              {item.locked ? null : (
                <IconButton
                  className="shrink-0"
                  title="Rename"
                  aria-label="Rename"
                  onClick={() => {
                    setRename(item)
                    setRenameName(item.displayName)
                  }}
                >
                  <AppIcon id="pencil" />
                </IconButton>
              )}
              {item.locked || item.id === activeId ? null : (
                <IconButton
                  className="shrink-0 text-red"
                  title="Delete"
                  aria-label="Delete"
                  onClick={() => setRemove(item)}
                >
                  <AppIcon id="trash-2" />
                </IconButton>
              )}
            </div>
          ))}
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-md border border-line bg-panel p-1.5 text-muted hover:bg-field hover:text-ink"
            aria-label="New profile"
            onClick={() => {
              setCreateName('')
              setCreateOpen(true)
            }}
          >
            <AppIcon id="plus" />
          </button>
        </div>
      </SettingsCard>
      <SettingsCard query={query} title="Removed" terms={`${PROFILES_QUERY} trash restore expire`}>
        {removed.length ? (
          <div className="flex flex-col gap-1.5">
            {removed.map((item) => (
              <div key={item.id} className={ROW}>
                <span className={NAME}>
                  <span className="min-w-0 truncate">{item.displayName}</span>
                  <span className="shrink-0 tabular-nums text-muted">{remainingLabel(item.expiresAt, now)}</span>
                </span>
                <IconButton
                  className="shrink-0"
                  title="Restore"
                  aria-label="Restore"
                  onClick={() => {
                    setError(null)
                    void restoreProfile(item.id)
                      .then(() => refresh())
                      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not restore profile'))
                  }}
                >
                  <AppIcon id="undo-2" />
                </IconButton>
                <IconButton
                  className="shrink-0 text-red"
                  title="Delete permanently"
                  aria-label="Delete permanently"
                  onClick={() => setPurge(item)}
                >
                  <AppIcon id="trash-2" />
                </IconButton>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">No removed profiles.</p>
        )}
      </SettingsCard>
      {createOpen ? (
        <NameDialog
          title="New profile"
          description={<p className="mt-1.5 text-xs text-muted">Starts empty. The app stays on the current profile until you switch.</p>}
          name={createName}
          busy={createBusy}
          onName={setCreateName}
          onClose={() => setCreateOpen(false)}
          actions={[
            { label: 'Cancel', onClick: () => setCreateOpen(false) },
            {
              label: 'Create',
              kind: 'primary',
              submit: true,
              disabled: !createName.trim() || taken.some((name) => name.toLowerCase() === createName.trim().toLowerCase()),
              onClick: () => {
                setCreateBusy(true)
                setError(null)
                void createProfile(createName.trim())
                  .then(() => refresh())
                  .then(() => setCreateOpen(false))
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not create profile'))
                  .finally(() => setCreateBusy(false))
              },
            },
          ]}
        />
      ) : null}
      {rename ? (
        <NameDialog
          title="Rename profile"
          name={renameName}
          busy={renameBusy}
          onName={setRenameName}
          onClose={() => setRename(null)}
          actions={[
            { label: 'Cancel', onClick: () => setRename(null) },
            {
              label: 'Save',
              kind: 'primary',
              submit: true,
              disabled: !renameName.trim() || taken.filter((name) => name !== rename.displayName).some((name) => name.toLowerCase() === renameName.trim().toLowerCase()),
              onClick: () => {
                setRenameBusy(true)
                setError(null)
                void renameProfile(rename.id, renameName.trim())
                  .then(() => refresh())
                  .then(() => setRename(null))
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not rename profile'))
                  .finally(() => setRenameBusy(false))
              },
            },
          ]}
        />
      ) : null}
      {remove ? (
        <ConfirmDialog
          title={`Delete ${remove.displayName}?`}
          body="Moved to Removed. Data is deleted after 72 hours."
          onClose={() => setRemove(null)}
          actions={[
            { label: 'Cancel', onClick: () => setRemove(null) },
            {
              label: 'Delete',
              kind: 'primary',
              danger: true,
              onClick: () => {
                const id = remove.id
                setRemove(null)
                setError(null)
                void deleteProfile(id)
                  .then(() => refresh())
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not delete profile'))
              },
            },
          ]}
        />
      ) : null}
      {purge ? (
        <ConfirmDialog
          title={`Delete ${purge.displayName}?`}
          body="This profile’s settings, gallery index, templates, thumbs, trash, and output folder will be removed. Shared models are kept."
          onClose={() => setPurge(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPurge(null) },
            {
              label: 'Delete',
              kind: 'primary',
              danger: true,
              onClick: () => {
                const id = purge.id
                setPurge(null)
                setError(null)
                void purgeProfile(id)
                  .then(() => refresh())
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not delete profile'))
              },
            },
          ]}
        />
      ) : null}
      {pending ? (
        <ConfirmDialog
          title={`Switch to ${pending.displayName}?`}
          body="The app will restart to load this profile."
          onClose={() => setPending(null)}
          actions={[
            { label: 'Cancel', onClick: () => setPending(null) },
            {
              label: 'Restart',
              kind: 'primary',
              onClick: () => {
                const id = pending.id
                setPending(null)
                setError(null)
                void activateProfile(id)
                  .then(() => restartApp())
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not switch profile'))
              },
            },
          ]}
        />
      ) : null}
    </div>
  )
}
