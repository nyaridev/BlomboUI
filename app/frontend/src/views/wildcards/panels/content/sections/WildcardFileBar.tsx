import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'

function fileName(path: string | null) {
  if (!path) {
    return 'Select a file'
  }
  const cut = path.lastIndexOf('/')
  return cut >= 0 ? path.slice(cut + 1) : path
}

export function WildcardFileBar({
  path,
  dirty,
  raw,
  busy,
  onRaw,
  onDashboard,
  onReveal,
  onRename,
  onSave,
}: {
  path: string | null
  dirty: boolean
  raw: boolean
  busy: boolean
  onRaw: () => void
  onDashboard: () => void
  onReveal: () => void
  onRename: () => void
  onSave: () => void
}) {
  const open = Boolean(path)
  return (
    <div className="mb-3 flex h-8 shrink-0 items-center gap-1">
      <div
        className="box-border flex h-8 w-fit max-w-56 min-w-0 items-center gap-0.5 rounded border border-line bg-field pl-2 pr-0.5"
        title={path || undefined}
      >
        <span className={['min-w-0 truncate font-mono text-sm leading-none', path ? 'text-ink' : 'text-muted'].join(' ')}>
          {fileName(path)}
        </span>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:text-ink disabled:opacity-40"
          aria-label="Rename"
          title="Rename"
          disabled={!open || busy}
          onClick={onRename}
        >
          <AppIcon id="pencil" />
        </button>
      </div>
      <div className="min-w-0 flex-1" />
      {dirty ? <span className="shrink-0 text-xs text-muted">Unsaved</span> : null}
      <div className="inline-flex h-8 shrink-0 rounded border border-line text-xs">
        <button
          type="button"
          className={['h-full rounded-l px-2', !raw && open ? 'bg-line text-ink' : 'text-muted hover:text-ink'].join(' ')}
          disabled={!open || busy || !raw}
          onClick={onDashboard}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={['h-full rounded-r px-2', raw && open ? 'bg-line text-ink' : 'text-muted hover:text-ink'].join(' ')}
          disabled={!open || busy || raw}
          onClick={onRaw}
        >
          Raw
        </button>
      </div>
      <IconButton className="shrink-0" aria-label="Open in Explorer"
        title="Open in Explorer"
        disabled={!open || busy}
        onClick={onReveal}><AppIcon id="square-arrow-out-up-right" /></IconButton>
      <button
        type="button"
        className="inline-flex h-8 items-center justify-center rounded border border-accent bg-accent px-3 text-sm leading-none text-ink disabled:opacity-40"
        disabled={!dirty || busy}
        onClick={onSave}
      >
        Save
      </button>
    </div>
  )
}
