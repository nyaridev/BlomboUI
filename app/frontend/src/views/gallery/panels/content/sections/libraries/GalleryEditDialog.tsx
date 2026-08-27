import { ChipSelect } from '@/components/controls/chip-select/ChipSelect.tsx'
import { Dialog } from '@/components/controls/dialog/Dialog.tsx'
import type { GalleryLibrary } from '@/lib/api/gallery.ts'
import { GalleryFilterTiles } from '@/views/gallery/panels/content/GalleryFilterTiles.tsx'
import { useState } from 'react'

export function GalleryEditDialog({
  title,
  initial,
  scopeOptions,
  onSave,
  onClose,
}: {
  title: string
  initial?: Pick<GalleryLibrary, 'name' | 'query' | 'scopes' | 'models' | 'loras' | 'wildcards'>
  scopeOptions: { id: string; name: string }[]
  onSave: (value: Pick<GalleryLibrary, 'name' | 'query' | 'scopes' | 'models' | 'loras' | 'wildcards'>) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [query, setQuery] = useState(initial?.query ?? '')
  const [scopes, setScopes] = useState(initial?.scopes ?? [])
  const [models, setModels] = useState(initial?.models ?? [])
  const [loras, setLoras] = useState(initial?.loras ?? [])
  const [wildcards, setWildcards] = useState(initial?.wildcards ?? [])
  const labels = Object.fromEntries(scopeOptions.map((item) => [item.id, item.name]))

  return (
    <Dialog onClose={onClose} className="w-[min(92vw,48rem)]">
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
      <div className="mt-3">
        <GalleryFilterTiles
          chromePrefix="gallery-create"
          fixedStyle="tall"
          models={models}
          loras={loras}
          wildcards={wildcards}
          onModels={setModels}
          onLoras={setLoras}
          onWildcards={setWildcards}
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
          onClick={() =>
            onSave({ name: name.trim(), query: query.trim(), scopes, models, loras, wildcards })
          }
        >
          Save
        </button>
      </div>
    </Dialog>
  )
}
