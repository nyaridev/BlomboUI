import { ButtonControl } from '@/components/controls/button/ButtonControl.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { DownloadMeter } from '@/components/controls/download-meter/DownloadMeter.tsx'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import type { ManagerModel } from '@/lib/api/manager.ts'

export function rowKey(item: ManagerModel) {
  return `${item.save_path}\0${item.filename}\0${item.name}`
}

export function ManagerTable({
  items,
  selected,
  installing,
  progress,
  onToggle,
  onToggleAll,
  onInstall,
}: {
  items: ManagerModel[]
  selected: Set<string>
  installing: Set<string>
  progress: Record<string, number>
  onToggle: (key: string, on: boolean) => void
  onToggleAll: (on: boolean) => void
  onInstall: (item: ManagerModel) => void
}) {
  const installable = items.filter((item) => item.installed !== 'True')
  const allOn = installable.length > 0 && installable.every((item) => selected.has(rowKey(item)))
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-left text-sm text-ink">
        <thead className="sticky top-0 z-10 bg-panel text-xs text-muted">
          <tr className="border-b border-line">
            <th className="w-8 px-2 py-2 font-medium">
              <CheckboxControl checked={allOn} onChange={onToggleAll} disabled={!installable.length} />
            </th>
            <th className="px-2 py-2 font-medium">Name</th>
            <th className="w-36 px-2 py-2 font-medium">Install</th>
            <th className="w-24 px-2 py-2 font-medium">Size</th>
            <th className="w-28 px-2 py-2 font-medium">Type</th>
            <th className="w-28 px-2 py-2 font-medium">Base</th>
            <th className="px-2 py-2 font-medium">Description</th>
            <th className="w-36 px-2 py-2 font-medium">Save path</th>
            <th className="w-44 px-2 py-2 font-medium">Filename</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const key = rowKey(item)
            const busy = installing.has(key)
            const pct = progress[key]
            const done = item.installed === 'True'
            return (
              <tr key={key} className="border-b border-line align-top">
                <td className="px-2 py-2">
                  <CheckboxControl
                    checked={selected.has(key)}
                    disabled={done || busy}
                    onChange={(on) => onToggle(key, on)}
                  />
                </td>
                <td className="px-2 py-2">
                  {item.reference ? (
                    <a className="font-semibold text-ink underline-offset-2 hover:underline" href={item.reference} target="_blank" rel="noreferrer">
                      {item.name}
                    </a>
                  ) : (
                    <span className="font-semibold">{item.name}</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  {done ? (
                    <span className="inline-flex items-center gap-1 text-green-bright">
                      <AppIcon id="check" size={14} />
                      Installed
                    </span>
                  ) : busy && pct != null ? (
                    <DownloadMeter pct={pct} label="Installing" />
                  ) : (
                    <ButtonControl tone="accent" size="sm" disabled={busy} onClick={() => onInstall(item)}>
                      {busy ? 'Installing…' : 'Install'}
                    </ButtonControl>
                  )}
                </td>
                <td className="px-2 py-2 text-muted">{item.size}</td>
                <td className="px-2 py-2">{item.type}</td>
                <td className="px-2 py-2">{item.base}</td>
                <td className="max-w-md px-2 py-2 text-muted">{item.description}</td>
                <td className="px-2 py-2 text-muted">{item.save_path}</td>
                <td className="px-2 py-2 text-muted">{item.filename}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!items.length ? <p className="p-4 text-sm text-muted">No Results</p> : null}
    </div>
  )
}
