import { SettingsBlock } from './SettingsBlock.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { Fragment } from 'react'

export const SAVING_QUERY =
  'saving output path folder images grids placeholder token workflow template model date time year month day weekday hour minute second datetime sampler scheduler seed width height size steps cfg'

const INPUT =
  'w-full rounded border border-line bg-field px-2 py-1.5 font-mono text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

type PathToken = { token: string; hint: string; example: string }

const PATH_SECTIONS: { title: string; tokens: PathToken[] }[] = [
  {
    title: 'Names',
    tokens: [
      { token: '[workflow]', hint: 'Workflow id', example: 'txt2img' },
      { token: '[workflow_name]', hint: 'Same as [workflow]', example: 'txt2img' },
      { token: '[template]', hint: 'Current template name', example: 'Default' },
      { token: '[template_name]', hint: 'Same as [template]', example: 'Default' },
      { token: '[model]', hint: 'Checkpoint name without extension', example: 'waiIllustriousSDXL_v140' },
      { token: '[model_dir]', hint: 'Checkpoint subfolder, if any', example: 'illustrious' },
    ],
  },
  {
    title: 'Date / time',
    tokens: [
      { token: '[date]', hint: 'Local date', example: '2026-08-19' },
      { token: '[year]', hint: 'Year', example: '2026' },
      { token: '[month]', hint: 'Month number', example: '08' },
      { token: '[month_name]', hint: 'Short month name', example: 'Aug' },
      { token: '[day]', hint: 'Day of month', example: '19' },
      { token: '[weekday]', hint: 'Short weekday', example: 'Wed' },
      { token: '[time]', hint: 'Local time', example: '12-26-04' },
      { token: '[hour]', hint: 'Hour (24h)', example: '12' },
      { token: '[minute]', hint: 'Minute', example: '26' },
      { token: '[second]', hint: 'Second', example: '04' },
      { token: '[datetime]', hint: 'Date and time', example: '2026-08-19_12-26-04' },
    ],
  },
  {
    title: 'Generation',
    tokens: [
      { token: '[sampler]', hint: 'Sampler', example: 'euler' },
      { token: '[scheduler]', hint: 'Scheduler', example: 'sgm_uniform' },
      { token: '[seed]', hint: 'Seed', example: '123456789' },
      { token: '[width]', hint: 'Width', example: '832' },
      { token: '[height]', hint: 'Height', example: '1216' },
      { token: '[size]', hint: 'Width x height', example: '832x1216' },
      { token: '[steps]', hint: 'Steps', example: '20' },
      { token: '[cfg]', hint: 'CFG scale', example: '4' },
    ],
  },
]

function preview(template: string) {
  const rows = PATH_SECTIONS.flatMap((section) => section.tokens).sort((a, b) => b.token.length - a.token.length)
  let out = template.replaceAll('\\', '/')
  for (const row of rows) {
    out = out.replaceAll(row.token, row.example)
  }
  return out
}

export function SavingPanel({ query = '' }: { query?: string }) {
  const imagePath = useSettingsStore((s) => s.imagePath)
  const gridPath = useSettingsStore((s) => s.gridPath)
  const setImagePath = useSettingsStore((s) => s.setImagePath)
  const setGridPath = useSettingsStore((s) => s.setGridPath)

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SettingsBlock query={query} title="Images folder" terms="png output path workflow date">
        <input
          className={INPUT}
          value={imagePath}
          onChange={(e) => setImagePath(e.target.value)}
          spellCheck={false}
        />
        <p className="text-xs text-muted">Example: {preview(imagePath)}</p>
      </SettingsBlock>
      <SettingsBlock query={query} title="Grids folder" terms="jpg contact sheet output path">
        <input
          className={INPUT}
          value={gridPath}
          onChange={(e) => setGridPath(e.target.value)}
          spellCheck={false}
        />
        <p className="text-xs text-muted">Example: {preview(gridPath)}</p>
      </SettingsBlock>
      <SettingsBlock query={query} title="Placeholders" terms={SAVING_QUERY}>
        <p className="text-xs text-muted">Relative to the output folder. Replaced when saving.</p>
        <div className="overflow-hidden rounded-md border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-3 py-1.5 font-medium">Token</th>
                <th className="px-3 py-1.5 font-medium">Meaning</th>
                <th className="px-3 py-1.5 font-medium">Example</th>
              </tr>
            </thead>
            <tbody>
              {PATH_SECTIONS.map((section) => (
                <Fragment key={section.title}>
                  <tr className="border-b border-line bg-field">
                    <th
                      colSpan={3}
                      className="px-3 py-1.5 text-left text-[10px] font-medium tracking-[0.12em] text-muted uppercase"
                    >
                      {section.title}
                    </th>
                  </tr>
                  {section.tokens.map((row) => (
                    <tr key={row.token} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5 font-mono text-ink">{row.token}</td>
                      <td className="px-3 py-1.5 text-muted">{row.hint}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-muted">{row.example}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsBlock>
    </div>
  )
}
