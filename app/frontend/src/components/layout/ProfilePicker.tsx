import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ConfirmDialog, Dialog } from '@/components/controls/dialog/Dialog.tsx'
import { activateProfile, getProfiles, type ProfileInfo } from '@/lib/api.ts'
import { useHealthStore } from '@/stores/healthStore.ts'
import { useEffect, useState } from 'react'

const CHIP =
  'flex h-8 shrink-0 items-center gap-1.5 rounded border border-line bg-field px-2 text-sm text-ink hover:bg-line'
const ICON_BTN = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink'

export function ProfilePicker({ onReload }: { onReload: () => void }) {
  const healthName = useHealthStore((s) => s.health?.profile?.displayName)
  const healthId = useHealthStore((s) => s.health?.profile?.id)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ProfileInfo[]>([])
  const [activeId, setActiveId] = useState(healthId || 'default')
  const [pending, setPending] = useState<ProfileInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const current = items.find((item) => item.id === activeId)
  const label = current?.displayName || healthName || 'Default'

  useEffect(() => {
    if (healthId) {
      setActiveId(healthId)
    }
  }, [healthId])

  useEffect(() => {
    if (!open) {
      return
    }
    setError(null)
    void getProfiles()
      .then((data) => {
        setItems(data.profiles)
        setActiveId(data.activeId)
      })
      .catch(() => setItems([]))
  }, [open])

  return (
    <>
      <button type="button" className={CHIP} onClick={() => setOpen(true)}>
        <span className="text-muted">
          <AppIcon id="circle-user" />
        </span>
        {label}
        <span className="text-muted">
          <AppIcon id="chevron-down" size={12} />
        </span>
      </button>
      {open ? (
        <Dialog
          onClose={() => setOpen(false)}
          className="flex w-[min(92vw,22rem)] min-w-0 flex-col gap-2"
        >
          <div className="-mx-3 -mt-3 flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">Profiles</span>
            <button type="button" className={ICON_BTN} aria-label="Close" onClick={() => setOpen(false)}>
              <AppIcon id="x" />
            </button>
          </div>
          {error ? <p className="text-xs text-accent">{error}</p> : null}
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === activeId ? 'true' : undefined}
                className={[
                  'flex h-toolbar min-w-0 w-full items-center gap-cluster rounded px-2 text-left text-sm',
                  item.id === activeId ? 'bg-accent text-ink' : 'text-ink hover:bg-line',
                ].join(' ')}
                onClick={() => {
                  if (item.id === activeId) {
                    return
                  }
                  setPending(item)
                  setOpen(false)
                }}
              >
                <span className="min-w-0 truncate">{item.displayName}</span>
              </button>
            ))}
          </div>
        </Dialog>
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
                  .then(() => onReload())
                  .catch((err: unknown) => {
                    setError(err instanceof Error ? err.message : 'Could not switch profile')
                    setOpen(true)
                  })
              },
            },
          ]}
        />
      ) : null}
    </>
  )
}
