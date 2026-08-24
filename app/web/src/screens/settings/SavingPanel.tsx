import { SettingsBlock, SettingsCard } from './SettingsBlock.tsx'
import { IMAGE_FORMATS, useSettingsStore, type ImageFormat } from '@/stores/settingsStore.ts'
import { NumberField } from '@/components/primitives/NumberField.tsx'
import { SelectField } from '@/components/primitives/SelectField.tsx'
import { SliderField } from '@/components/primitives/SliderField.tsx'
import { Fragment } from 'react'

export const SAVING_QUERY =
  'saving output path folder images grids interrupted skip cancel name filename number placeholder token workflow template model date time year month day weekday hour minute second datetime sampler scheduler seed width height size steps cfg format png jpg jpeg webp quality large sidecar'

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
  {
    title: 'File name',
    tokens: [{ token: '[number]', hint: 'Next free index in the folder, zero-padded', example: '000049' }],
  },
]

export function previewPath(template: string) {
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
  const interruptedPath = useSettingsStore((s) => s.interruptedPath)
  const imageName = useSettingsStore((s) => s.imageName)
  const gridName = useSettingsStore((s) => s.gridName)
  const saveInterrupted = useSettingsStore((s) => s.saveInterrupted)
  const imageFormat = useSettingsStore((s) => s.imageFormat)
  const gridFormat = useSettingsStore((s) => s.gridFormat)
  const imageQuality = useSettingsStore((s) => s.imageQuality)
  const saveLargeAsJpeg = useSettingsStore((s) => s.saveLargeAsJpeg)
  const largeJpegMaxKb = useSettingsStore((s) => s.largeJpegMaxKb)
  const setImagePath = useSettingsStore((s) => s.setImagePath)
  const setGridPath = useSettingsStore((s) => s.setGridPath)
  const setInterruptedPath = useSettingsStore((s) => s.setInterruptedPath)
  const setImageName = useSettingsStore((s) => s.setImageName)
  const setGridName = useSettingsStore((s) => s.setGridName)
  const setSaveInterrupted = useSettingsStore((s) => s.setSaveInterrupted)
  const setImageFormat = useSettingsStore((s) => s.setImageFormat)
  const setGridFormat = useSettingsStore((s) => s.setGridFormat)
  const setImageQuality = useSettingsStore((s) => s.setImageQuality)
  const setSaveLargeAsJpeg = useSettingsStore((s) => s.setSaveLargeAsJpeg)
  const setLargeJpegMaxKb = useSettingsStore((s) => s.setLargeJpegMaxKb)
  const qualityOn = imageFormat !== 'png' || saveLargeAsJpeg

  return (
    <div className="flex max-w-2xl flex-col gap-3">
        <SettingsCard query={query} title="File format" terms="png jpg jpeg webp extension quality sidecar 4mb threshold">
        <SettingsBlock query={query} title="Image format" terms="png jpg jpeg webp extension">
          <SelectField
            value={imageFormat}
            onChange={(value) => setImageFormat(value as ImageFormat)}
            options={[...IMAGE_FORMATS]}
          />
        </SettingsBlock>
        <SettingsBlock query={query} title="Grid format" terms="png jpg jpeg webp extension contact sheet grid">
          <SelectField
            value={gridFormat}
            onChange={(value) => setGridFormat(value as ImageFormat)}
            options={[...IMAGE_FORMATS]}
          />
        </SettingsBlock>
        <SettingsBlock query={query} title="Image quality" terms="jpeg webp jpg quality">
          <div className={qualityOn ? '' : 'pointer-events-none opacity-40'}>
            <SliderField value={imageQuality} onChange={setImageQuality} min={1} max={100} />
          </div>
          <p className="text-xs text-muted">Used for JPEG and WebP, and for the large-file JPEG copy.</p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Save large images as JPEG" terms="sidecar jpg 4mb threshold">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="check"
              checked={saveLargeAsJpeg}
              onChange={(e) => setSaveLargeAsJpeg(e.target.checked)}
            />
            Also save a JPEG when the file is larger than
          </label>
          <div className={saveLargeAsJpeg ? 'max-w-40' : 'max-w-40 pointer-events-none opacity-40'}>
            <NumberField value={largeJpegMaxKb} onChange={setLargeJpegMaxKb} min={256} max={65536} />
          </div>
          <p className="text-xs text-muted">
            Off by default. Threshold is in KB (4096 = 4 MB). The JPEG sits next to the original and is skipped if the
            original is already JPEG.
          </p>
        </SettingsBlock>
      </SettingsCard>
      <SettingsCard query={query} title="Images" terms="image name images folder filename number seed model png output path workflow date">
        <SettingsBlock query={query} title="Name" terms="image name filename number seed model png">
          <input
            className={INPUT}
            value={imageName}
            onChange={(e) => setImageName(e.target.value)}
            spellCheck={false}
          />
          <p className="text-xs text-muted">
            Example: {previewPath(imageName)}.{imageFormat}
          </p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Folder" terms="images folder png output path workflow date">
          <input
            className={INPUT}
            value={imagePath}
            onChange={(e) => setImagePath(e.target.value)}
            spellCheck={false}
          />
          <p className="text-xs text-muted">Example: {previewPath(imagePath)}</p>
        </SettingsBlock>
      </SettingsCard>
      <SettingsCard query={query} title="Grids" terms="grid name grids folder filename number contact sheet jpg output path">
        <SettingsBlock query={query} title="Name" terms="grid name filename number contact sheet jpg">
          <input
            className={INPUT}
            value={gridName}
            onChange={(e) => setGridName(e.target.value)}
            spellCheck={false}
          />
          <p className="text-xs text-muted">Example: {previewPath(gridName)}.{gridFormat}</p>
        </SettingsBlock>
        <SettingsBlock query={query} title="Folder" terms="grids folder jpg contact sheet output path">
          <input
            className={INPUT}
            value={gridPath}
            onChange={(e) => setGridPath(e.target.value)}
            spellCheck={false}
          />
          <p className="text-xs text-muted">Example: {previewPath(gridPath)}</p>
        </SettingsBlock>
      </SettingsCard>
      <SettingsCard query={query} title="Interrupted images" terms="skip cancel unfinished preview save interrupted folder">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={saveInterrupted}
            onChange={(e) => setSaveInterrupted(e.target.checked)}
          />
          Save the in-progress image when generation is skipped or cancelled
        </label>
        <p className="text-xs text-muted">On by default. Uses the last preview frame, not a finished sample.</p>
        <div className={saveInterrupted ? '' : 'pointer-events-none opacity-40'}>
          <input
            className={INPUT}
            value={interruptedPath}
            onChange={(e) => setInterruptedPath(e.target.value)}
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-muted">Example: {previewPath(interruptedPath)}</p>
        </div>
      </SettingsCard>
      <SettingsCard query={query} title="Placeholders" terms={SAVING_QUERY} id="settings-placeholders">
        <p className="text-xs text-muted">
          Relative to the output folder. File names use the same tokens, plus [number] for the next free index.
        </p>
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
      </SettingsCard>
    </div>
  )
}
