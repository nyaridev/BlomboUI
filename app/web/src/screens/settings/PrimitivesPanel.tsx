import { ChipInput } from '@/components/ChipInput.tsx'
import { ChipSelect } from '@/components/ChipSelect.tsx'
import { CloseIcon } from '@/components/CloseIcon.tsx'
import { ShuffleIcon, SwapIcon, UndoIcon } from '@/components/ControlIcons.tsx'
import { ExpandSection } from '@/components/ExpandSection.tsx'
import { ImageDrop } from '@/components/ImageDrop.tsx'
import { NumberField } from '@/components/NumberField.tsx'
import { ProgressBar } from '@/components/ProgressBar.tsx'
import { RefreshIcon } from '@/components/RefreshIcon.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { SliderField } from '@/components/SliderField.tsx'
import { SettingsBlock } from './SettingsBlock.tsx'
import { useState, type CSSProperties } from 'react'

function fieldClass() {
  return 'w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none focus:border-accent'
}

export function PrimitivesPanel({ query = '' }: { query?: string }) {
  const [text, setText] = useState('1girl, black hair')
  const [number, setNumber] = useState(20)
  const [area, setArea] = useState('')
  const [choice, setChoice] = useState('euler')
  const [slider, setSlider] = useState(4)
  const [pct, setPct] = useState(27)
  const [hires, setHires] = useState(true)
  const [picks, setPicks] = useState<string[]>(['euler'])
  const [tags, setTags] = useState<string[]>(['1girl'])
  const eta = Math.max(0, Math.round((100 - pct) * 0.45))

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <SettingsBlock query={query} title="Button" terms="generate interrupt disabled icon" className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded bg-accent px-3 py-2 text-sm font-semibold text-ink">
            Generate
          </button>
          <button
            type="button"
            className="rounded bg-accent px-3 py-2 text-sm font-semibold text-ink disabled:opacity-40"
            disabled
          >
            Disabled
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="icon-btn" aria-label="Random seed">
            <ShuffleIcon />
          </button>
          <button type="button" className="icon-btn" aria-label="Restore last seed">
            <UndoIcon />
          </button>
          <button type="button" className="icon-btn" aria-label="Swap width and height">
            <SwapIcon />
          </button>
          <button type="button" className="icon-btn" aria-label="Refresh">
            <RefreshIcon />
          </button>
          <button type="button" className="icon-btn" aria-label="Close">
            <CloseIcon />
          </button>
          <button type="button" className="icon-btn" aria-label="Disabled" disabled>
            <ShuffleIcon />
          </button>
        </div>
      </SettingsBlock>

      <SettingsBlock query={query} title="Text" className="flex flex-col gap-2">
        <input className={fieldClass()} value={text} onChange={(e) => setText(e.target.value)} />
      </SettingsBlock>

      <SettingsBlock query={query} title="Number" className="flex flex-col gap-2">
        <NumberField value={number} onChange={setNumber} />
      </SettingsBlock>

      <SettingsBlock query={query} title="Textarea" className="flex flex-col gap-2">
        <textarea
          className={`${fieldClass()} min-h-20 resize-y font-mono`}
          value={area}
          onChange={(e) => setArea(e.target.value)}
          spellCheck={false}
        />
      </SettingsBlock>

      <SettingsBlock query={query} title="Select" terms="euler" className="flex flex-col gap-2">
        <SelectField value={choice} onChange={setChoice} options={['euler', 'euler_a', 'dpmpp_2m']} />
      </SettingsBlock>

      <SettingsBlock query={query} title="Chip select" terms="sampler" className="flex flex-col gap-2">
        <ChipSelect
          options={['euler', 'euler_a', 'dpmpp_2m', 'dpmpp_sde', 'uni_pc']}
          value={picks}
          onChange={setPicks}
          placeholder="Add sampler…"
        />
      </SettingsBlock>

      <SettingsBlock query={query} title="Chip input" terms="tag" className="flex flex-col gap-2">
        <ChipInput value={tags} onChange={setTags} placeholder="Type a tag and press Enter…" />
      </SettingsBlock>

      <SettingsBlock query={query} title="Image drop" className="flex flex-col gap-2">
        <ImageDrop />
      </SettingsBlock>

      <SettingsBlock query={query} title="Checkbox" className="flex flex-col gap-2">
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="check" defaultChecked />
            On
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="check" />
            Off
          </label>
        </div>
      </SettingsBlock>

      <SettingsBlock query={query} title="Radio" terms="plain card" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">plain</span>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" className="radio" name="radio-plain" defaultChecked />
              On
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" className="radio" name="radio-plain" />
              Off
            </label>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted">card</span>
          <div className="flex gap-2">
            <label className="radio-card text-sm text-ink">
              <input type="radio" className="radio" name="radio-card" defaultChecked />
              On
            </label>
            <label className="radio-card text-sm text-ink">
              <input type="radio" className="radio" name="radio-card" />
              Off
            </label>
          </div>
        </div>
      </SettingsBlock>

      <SettingsBlock query={query} title="Slider" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <input
            className="slider"
            style={{ '--fill': `${((slider - 1) / 19) * 100}%` } as CSSProperties}
            type="range"
            min={1}
            max={20}
            step={0.5}
            value={slider}
            onChange={(e) => setSlider(Number(e.target.value))}
          />
          <span className="w-8 shrink-0 text-right text-sm text-muted">{slider}</span>
        </div>
        <SliderField label="With number" value={slider} onChange={setSlider} min={1} max={20} step={0.5} />
      </SettingsBlock>

      <SettingsBlock query={query} title="Progress" terms="eta" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <input
            className="slider"
            style={{ '--fill': `${pct}%` } as CSSProperties}
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
          />
          <span className="w-10 shrink-0 text-right text-sm text-muted">{pct}%</span>
        </div>
        <ProgressBar pct={pct} label={`${pct}% ETA: ${eta}s`} />
      </SettingsBlock>

      <SettingsBlock query={query} title="Section" terms="advanced" className="flex flex-col gap-2">
        <ExpandSection title="Advanced">
          <p className="text-sm text-muted">Extra settings go here.</p>
        </ExpandSection>
      </SettingsBlock>

      <SettingsBlock query={query} title="Toggle section" terms="hires fix" className="flex flex-col gap-2">
        <ExpandSection title="Hires fix" enabled={hires} onEnabled={setHires}>
          <NumberField value={number} onChange={setNumber} />
        </ExpandSection>
      </SettingsBlock>
    </div>
  )
}
