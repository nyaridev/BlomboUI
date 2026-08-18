import { ChipInput } from '@/components/ChipInput.tsx'
import { ChipSelect } from '@/components/ChipSelect.tsx'
import { ExpandSection } from '@/components/ExpandSection.tsx'
import { ImageDrop } from '@/components/ImageDrop.tsx'
import { NumberField } from '@/components/NumberField.tsx'
import { ProgressBar } from '@/components/ProgressBar.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { useState, type CSSProperties } from 'react'

function fieldClass() {
  return 'w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none focus:border-accent'
}

export function PrimitivesPanel() {
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
      <section className="flex flex-col gap-2">
        <h2 className="text-xs text-label">Button</h2>
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
            🎲
          </button>
          <button type="button" className="icon-btn" aria-label="Open folder">
            📁
          </button>
          <button type="button" className="icon-btn" aria-label="Refresh">
            🔄
          </button>
          <button type="button" className="icon-btn" aria-label="Image">
            🖼️
          </button>
          <button type="button" className="icon-btn" aria-label="Settings">
            ⚙️
          </button>
          <button type="button" className="icon-btn" aria-label="Delete">
            🗑️
          </button>
          <button type="button" className="icon-btn" aria-label="Disabled" disabled>
            🎲
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs text-label">Text</h2>
        <input className={fieldClass()} value={text} onChange={(e) => setText(e.target.value)} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs text-label">Number</h2>
        <NumberField value={number} onChange={setNumber} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs text-label">Textarea</h2>
        <textarea
          className={`${fieldClass()} min-h-20 resize-y font-mono`}
          value={area}
          onChange={(e) => setArea(e.target.value)}
          spellCheck={false}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs text-label">Select</h2>
        <SelectField value={choice} onChange={setChoice} options={['euler', 'euler_a', 'dpmpp_2m']} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs text-label">Chip select</h2>
        <ChipSelect
          options={['euler', 'euler_a', 'dpmpp_2m', 'dpmpp_sde', 'uni_pc']}
          value={picks}
          onChange={setPicks}
          placeholder="Add sampler…"
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs text-label">Chip input</h2>
        <ChipInput value={tags} onChange={setTags} placeholder="Type a tag and press Enter…" />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs text-label">Image drop</h2>
        <ImageDrop />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs text-label">Checkbox</h2>
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
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs text-label">Radio</h2>
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
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs text-label">Slider</h2>
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
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs text-label">Progress</h2>
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
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs text-label">Section</h2>
        <ExpandSection title="Advanced">
          <p className="text-sm text-muted">Extra settings go here.</p>
        </ExpandSection>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs text-label">Toggle section</h2>
        <ExpandSection title="Hires fix" enabled={hires} onEnabled={setHires}>
          <NumberField value={number} onChange={setNumber} />
        </ExpandSection>
      </section>
    </div>
  )
}
