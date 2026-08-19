import { Fragment } from 'react'
import { SettingsBlock } from './SettingsBlock.tsx'

export const SHORTCUTS_QUERY =
  'shortcuts keys keyboard hotkey reload models generate cancel interrupt enter ctrl shift alt escape fullscreen tabs'

type Shortcut = { keys: string[]; action: string }

const SHORTCUT_SECTIONS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'Generation',
    items: [
      { keys: ['Ctrl', 'Enter'], action: 'Generate the current prompt' },
      { keys: ['Ctrl', 'Shift', 'Enter'], action: 'Cancel the current generation and start a new one' },
      { keys: ['Ctrl', 'Alt', 'Enter'], action: 'Cancel the current generation' },
      { keys: ['Esc'], action: 'Interrupt the current image' },
    ],
  },
  {
    title: 'View',
    items: [{ keys: ['F'], action: 'Toggle fullscreen image' }],
  },
  {
    title: 'Navigation',
    items: [
      { keys: ['Alt', '1…4'], action: 'Generate tabs (Generation, Base Model, LoRA, Wildcards)' },
      { keys: ['Ctrl', '1…6'], action: 'App tabs (Generate, File Info, Gallery, Models, Errors, Settings)' },
    ],
  },
  {
    title: 'App',
    items: [
      { keys: ['R'], action: 'Reload models' },
      { keys: ['Ctrl', 'R'], action: 'Reload the UI' },
    ],
  },
]

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {keys.map((key, i) => (
        <Fragment key={key}>
          {i > 0 ? <span className="text-muted">+</span> : null}
          <kbd className="rounded border border-line bg-field px-1.5 py-0.5 font-mono text-xs text-ink">{key}</kbd>
        </Fragment>
      ))}
    </span>
  )
}

export function ShortcutsPanel({ query = '' }: { query?: string }) {
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <SettingsBlock query={query} title="Shortcuts" terms={SHORTCUTS_QUERY}>
        <div className="overflow-hidden rounded-md border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-3 py-1.5 font-medium">Keys</th>
                <th className="px-3 py-1.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUT_SECTIONS.map((section) => (
                <Fragment key={section.title}>
                  <tr className="border-b border-line bg-field">
                    <th
                      colSpan={2}
                      className="px-3 py-1.5 text-left text-[10px] font-medium tracking-[0.12em] text-muted uppercase"
                    >
                      {section.title}
                    </th>
                  </tr>
                  {section.items.map((row) => (
                    <tr key={row.keys.join('+')} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5">
                        <Keys keys={row.keys} />
                      </td>
                      <td className="px-3 py-1.5 text-ink">{row.action}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">R and F are ignored while typing in a field.</p>
      </SettingsBlock>
    </div>
  )
}
