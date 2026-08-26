import { ChipSelect } from '@/components/primitives/ChipSelect.tsx'
import { Dialog } from '@/components/primitives/Dialog.tsx'
import type { GalleryLibrary } from '@/lib/api/gallery.ts'
import { useState } from 'react'

export function GalleryEditDialog({
  title,
  initial,
  scopeOptions,
  modelOptions,
  onSave,
  onClose,
}: {
  title: string
  initial?: Pick<GalleryLibrary, 'name' | 'query' | 'scopes' | 'models'>
  scopeOptions: { id: string; name: string }[]
  modelOptions: string[]
  onSave: (value: Pick<GalleryLibrary, 'name' | 'query' | 'scopes' | 'models'>) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [query, setQuery] = useState(initial?.query ?? '')
  const [scopes, setScopes] = useState(initial?.scopes ?? [])
  const [models, setModels] = useState(initial?.models ?? [])
  const labels = Object.fromEntries(scopeOptions.map((item) => [item.id, item.name]))

  return (
    <Dialog onClose={onClose} className="w-[min(92vw,28rem)]">
      <p className="text-sm text-ink">{title}</p>
      <label className="mt-3 flex flex-col gap-1 text-xs text-muted">
        Name
        <input
          className="h-8 rounded border border-line bg-field px-2 text-sm text-ink outline-none focus:border-accent"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </label>
      <label className="mt-3 flex flex-col gap-1 text-xs text-muted">
        Search
        <input
          className="h-8 rounded border border-line bg-field px-2 text-sm text-ink outline-none focus:border-accent"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tags, prompt text…"
        />
      </label>
      <div className="mt-3 flex flex-col gap-1 text-xs text-muted">
        Scopes
        <ChipSelect
          options={scopeOptions.map((item) => item.id)}
          value={scopes}
          onChange={setScopes}
          chipLabel={(id) => labels[id] || id}
          placeholder="Add scopes…"
        />
      </div>
      <div className="mt-3 flex flex-col gap-1 text-xs text-muted">
        Models
        <ChipSelect
          options={modelOptions}
          value={models}
          onChange={setModels}
          allowCustom
          placeholder="Models used…"
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="rounded px-3 py-1.5 text-sm text-muted hover:text-ink" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="rounded bg-accent px-3 py-1.5 text-sm text-ink disabled:opacity-50"
          disabled={!name.trim()}
          onClick={() => onSave({ name: name.trim(), query: query.trim(), scopes, models })}
        >
          Save
        </button>
      </div>
    </Dialog>
  )
}
