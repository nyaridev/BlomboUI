import { Fragment } from 'react'
import { SettingsCard } from './SettingsBlock.tsx'

export const SHORTCUTS_QUERY =
  'shortcuts keys keyboard hotkey reload models generate cancel interrupt enter ctrl shift alt escape fullscreen tabs prompt weight attention lora arrow indent wildcard raw autocomplete tab'

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
    title: 'Prompt',
    items: [
      { keys: ['Ctrl', 'Up'], action: 'Increase weight of the selected prompt text, or LoRA strength' },
      { keys: ['Ctrl', 'Down'], action: 'Decrease weight of the selected prompt text, or LoRA strength' },
      { keys: ['Tab'], action: 'Complete the selected tag in the prompt autocomplete list' },
      { keys: ['Enter'], action: 'Complete the selected tag in the prompt autocomplete list' },
      { keys: ['Up'], action: 'Move up in the prompt autocomplete list' },
      { keys: ['Down'], action: 'Move down in the prompt autocomplete list' },
    ],
  },
  {
    title: 'Wildcard raw editor',
    items: [
      { keys: ['Tab'], action: 'Indent the current or selected lines' },
      { keys: ['Shift', 'Tab'], action: 'Unindent the current or selected lines' },
      { keys: ['Alt', 'Up'], action: 'Move the current or selected lines up' },
      { keys: ['Alt', 'Down'], action: 'Move the current or selected lines down' },
    ],
  },
  {
    title: 'View',
    items: [{ keys: ['F'], action: 'Toggle fullscreen image' }],
  },
  {
    title: 'Navigation',
    items: [
      { keys: ['Alt', '1…4'], action: 'Generate tabs. Follows order and exclusions if that setting is on' },
      { keys: ['Ctrl', '1…9'], action: 'App tabs. Follows order and exclusions if that setting is on' },
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
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Shortcuts" terms={SHORTCUTS_QUERY}>
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
      </SettingsCard>
    </div>
  )
}
