import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { openFolder, pickFolder } from '@/lib/api.ts'
import { toast } from '@/stores/toastStore.ts'

const FIELD =
  'box-border h-toolbar min-w-0 flex-1 rounded border border-line bg-field px-2 py-0 font-mono text-sm leading-[1.875rem] text-ink outline-none placeholder:text-muted focus:border-accent disabled:opacity-70'

export function FolderField({
  value,
  onChange,
  readOnly = false,
  placeholder = '',
}: {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  placeholder?: string
}) {
  const path = value.trim()

  async function browse() {
    try {
      const next = await pickFolder()
      if (next) {
        onChange?.(next)
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open folder picker', 'error')
    }
  }

  async function reveal() {
    if (!path) {
      return
    }
    try {
      await openFolder(path)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Folder not found', 'error')
    }
  }

  return (
    <div className="flex h-8 w-full min-w-0 items-center gap-1">
      <input
        className={FIELD}
        value={value}
        title={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={readOnly ? undefined : (event) => onChange?.(event.target.value)}
      />
      {readOnly ? null : (
        <IconButton className="shrink-0" aria-label="Browse folder" onClick={() => void browse()}>
          <AppIcon id="folder" /></IconButton>
      )}
      <IconButton className="shrink-0" aria-label="Open folder"
        disabled={!path}
        onClick={() => void reveal()}
      >
        <AppIcon id="square-arrow-out-up-right" /></IconButton>
    </div>
  )
}
