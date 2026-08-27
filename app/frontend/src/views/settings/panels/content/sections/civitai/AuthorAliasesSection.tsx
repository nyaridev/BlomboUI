import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { AUTHOR_ALIAS_RE, authorAliasConflict } from '@/lib/civitai/download.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { useEffect, useState } from 'react'

export const AUTHOR_ALIASES_QUERY = 'author aliases civitai creator filename prefix naming custom'

type Row = { id: string; author: string; alias: string }

function rowsFromMap(aliases: Record<string, string>): Row[] {
  return Object.entries(aliases)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([author, alias]) => ({ id: author.toLowerCase(), author, alias }))
}

function isBlank(row: Row) {
  return !row.author.trim() && !row.alias.trim()
}

function rowError(row: Row, rows: Row[]) {
  const author = row.author.trim()
  const alias = row.alias.trim()
  if (isBlank(row)) {
    return false
  }
  if (!author || !alias || alias.length > 80 || !AUTHOR_ALIAS_RE.test(alias)) {
    return true
  }
  const authorKey = author.toLowerCase()
  if (rows.some((item) => item.id !== row.id && item.author.trim().toLowerCase() === authorKey)) {
    return true
  }
  const others: Record<string, string> = {}
  for (const item of rows) {
    if (item.id === row.id || isBlank(item)) {
      continue
    }
    const name = item.author.trim()
    const prefix = item.alias.trim()
    if (name && prefix) {
      others[name] = prefix
    }
  }
  return authorAliasConflict(others, author, alias)
}

function mapFromValidRows(rows: Row[]) {
  const out: Record<string, string> = {}
  const used = new Set<string>()
  for (const row of rows) {
    if (isBlank(row) || rowError(row, rows)) {
      continue
    }
    const author = row.author.trim()
    const alias = row.alias.trim()
    const key = alias.toLowerCase()
    if (used.has(key)) {
      continue
    }
    used.add(key)
    out[author] = alias
  }
  return out
}

const INPUT =
  'box-border h-8 min-w-0 flex-1 rounded border border-line bg-field px-2 py-0 font-mono text-sm leading-[1.875rem] text-ink outline-none placeholder:text-muted focus:border-accent'

export function AuthorAliasesSection({ query = '' }: { query?: string }) {
  const aliases = useSettingsStore((state) => state.civitaiDownload.authorAliases)
  const setCivitaiDownload = useSettingsStore((state) => state.setCivitaiDownload)
  const snapshot = JSON.stringify(aliases)
  const [rows, setRows] = useState(() => rowsFromMap(aliases))

  useEffect(() => {
    const stored = JSON.parse(snapshot) as Record<string, string>
    setRows((prev) => {
      const valid = prev.filter((row) => !isBlank(row) && !rowError(row, prev))
      if (JSON.stringify(mapFromValidRows(valid)) === snapshot) {
        return prev
      }
      const drafts = prev.filter(isBlank)
      const next = rowsFromMap(stored)
      return drafts.length ? [...next, ...drafts] : next
    })
  }, [snapshot])

  function commit(next: Row[]) {
    setRows(next)
    if (next.some((row) => !isBlank(row) && rowError(row, next))) {
      return
    }
    setCivitaiDownload({ authorAliases: mapFromValidRows(next) })
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard
        query={query}
        title="Author Aliases"
        terms={AUTHOR_ALIASES_QUERY}
        id="settings-author-aliases"
        setting="civitaiDownload"
        field="authorAliases"
      >
        <p className="text-xs text-muted">
          Filename prefixes used when custom naming is on. Original creator is the CivitAI username; the prefix is
          prepended to downloaded model files.
        </p>
        {rows.length === 0 ? (
          <p className="text-xs text-muted">No aliases yet. Add one, or set a prefix when downloading a model.</p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          {rows.length > 0 ? (
            <div className="flex items-center gap-1.5 px-1.5 text-xs text-muted">
              <span className="min-w-0 flex-1">Original creator</span>
              <span className="min-w-0 flex-1">Filename prefix</span>
              <span className="w-8 shrink-0" />
            </div>
          ) : null}
          {rows.map((row) => {
            const invalid = rowError(row, rows)
            return (
              <div
                key={row.id}
                className={[
                  'flex items-center gap-1.5 rounded-md border p-1.5',
                  invalid ? 'border-red/70 bg-red/15' : 'border-line bg-panel',
                ].join(' ')}
              >
                <input
                  className={INPUT}
                  value={row.author}
                  onChange={(event) =>
                    commit(rows.map((item) => (item.id === row.id ? { ...item, author: event.target.value } : item)))
                  }
                  spellCheck={false}
                  maxLength={200}
                  placeholder="Creator username"
                />
                <input
                  className={INPUT}
                  value={row.alias}
                  onChange={(event) =>
                    commit(rows.map((item) => (item.id === row.id ? { ...item, alias: event.target.value } : item)))
                  }
                  spellCheck={false}
                  maxLength={80}
                  placeholder="Prefix"
                />
                <IconButton className="shrink-0" aria-label={`Remove ${row.author || 'alias'}`}
                  onClick={() =>commit(rows.filter((item) => item.id !== row.id))}
                >
                  <AppIcon id="x" /></IconButton>
              </div>
            )
          })}
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-md border border-line bg-panel p-1.5 text-muted hover:bg-field hover:text-ink"
            aria-label="Add alias"
            onClick={() => setRows([...rows, { id: crypto.randomUUID(), author: '', alias: '' }])}
          >
            <AppIcon id="plus" />
          </button>
        </div>
      </SettingsCard>
    </div>
  )
}
