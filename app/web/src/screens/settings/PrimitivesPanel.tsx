import { ChipInput } from '@/components/primitives/ChipInput.tsx'
import { ChipList } from '@/components/primitives/ChipList.tsx'
import { ChipSelect } from '@/components/primitives/ChipSelect.tsx'
import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/chrome/ContextMenu.tsx'
import { ExpandSection } from '@/components/primitives/ExpandSection.tsx'
import { FolderField } from '@/components/primitives/FolderField.tsx'
import { FolderList, type FolderEntry } from '@/components/primitives/FolderList.tsx'
import { ImageDrop } from '@/components/primitives/ImageDrop.tsx'
import { NumberField } from '@/components/primitives/NumberField.tsx'
import { ResizableTextarea } from '@/components/primitives/ResizableTextarea.tsx'
import { DownloadMeter } from '@/components/primitives/DownloadMeter.tsx'
import { ProgressBar } from '@/components/primitives/ProgressBar.tsx'
import { SelectField } from '@/components/primitives/SelectField.tsx'
import { SliderField } from '@/components/primitives/SliderField.tsx'
import { Dialog, ConfirmDialog } from '@/components/primitives/Dialog.tsx'
import { IconPicker } from '@/components/chrome/IconPicker.tsx'
import { GlyphMark } from '@/components/chrome/GlyphMark.tsx'
import { CUSTOM_GLYPH, type Glyph } from '@/components/chrome/glyph.ts'
import { PaneSplitter } from '@/components/chrome/PaneSplitter.tsx'
import { ResizeGrip } from '@/components/chrome/ResizeGrip.tsx'
import { MetaCard } from '@/components/models/MetaCard.tsx'
import { TilePreview } from '@/components/models/TilePreview.tsx'
import { ThumbnailScopePicker } from '@/components/models/ThumbnailScopePicker.tsx'
import { CheckpointField } from '@/components/models/CheckpointField.tsx'
import { SettingsBlock, SettingsCard } from './SettingsBlock.tsx'
import { useRef, useState, type CSSProperties } from 'react'

function fieldClass() {
  return 'w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none focus:border-accent'
}

export function PrimitivesPanel({ query = '' }: { query?: string }) {
  const [text, setText] = useState('1girl, black hair')
  const [number, setNumber] = useState(20)
  const [area, setArea] = useState('')
  const [choice, setChoice] = useState('euler')
  const [checkpoint, setCheckpoint] = useState('')
  const [slider, setSlider] = useState(4)
  const [pct, setPct] = useState(27)
  const [hires, setHires] = useState(true)
  const [picks, setPicks] = useState<string[]>(['euler'])
  const [tags, setTags] = useState<string[]>(['1girl'])
  const [listTags, setListTags] = useState<string[]>(['first', 'second'])
  const [folder, setFolder] = useState('A:\\Projects\\models')
  const [folders, setFolders] = useState<FolderEntry[]>([
    { id: 'local', name: 'Local', path: '' },
    { id: 'demo-1', name: 'Models_001', path: 'D:\\Extra\\models' },
  ])
  const [glyph, setGlyph] = useState<Glyph>(CUSTOM_GLYPH)
  const [dialog, setDialog] = useState<'dialog' | 'confirm' | null>(null)
  const [menu, setMenu] = useState(false)
  const [panelHeight, setPanelHeight] = useState(128)
  const splitterRef = useRef<HTMLDivElement>(null)
  const eta = Math.max(0, Math.round((100 - pct) * 0.45))

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Buttons" terms="generate interrupt disabled icon">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded bg-generate px-3 py-2 text-sm font-semibold text-ink">
            Generate
          </button>
          <button type="button" className="rounded bg-accent px-3 py-2 text-sm font-semibold text-ink">
            Accent
          </button>
          <button type="button" className="rounded bg-muted px-3 py-2 text-sm font-semibold text-ink">
            Muted
          </button>
          <button type="button" className="rounded bg-red px-3 py-2 text-sm font-semibold text-ink">
            Danger
          </button>
          <button
            type="button"
            className="rounded bg-blue px-3 py-2 text-sm font-semibold text-ink disabled:opacity-40"
            disabled
          >
            Disabled
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="icon-btn" aria-label="Random seed">
            <AppIcon id="shuffle" />
          </button>
          <button type="button" className="icon-btn" aria-label="Restore last seed">
            <AppIcon id="rotate-ccw" />
          </button>
          <button type="button" className="icon-btn" aria-label="Swap width and height">
            <AppIcon id="arrow-up-down" />
          </button>
          <button type="button" className="icon-btn" aria-label="Refresh">
            <AppIcon id="refresh-cw" />
          </button>
          <button type="button" className="icon-btn" aria-label="Close">
            <AppIcon id="x" />
          </button>
          <button type="button" className="icon-btn" aria-label="Disabled" disabled>
            <AppIcon id="shuffle" />
          </button>
        </div>
      </SettingsCard>

      <SettingsCard query={query} title="Text fields" terms="text number textarea">
        <SettingsBlock query={query} title="Text" className="flex flex-col gap-2">
          <input className={fieldClass()} value={text} onChange={(e) => setText(e.target.value)} />
        </SettingsBlock>
        <SettingsBlock query={query} title="Number" className="flex flex-col gap-2">
          <NumberField value={number} onChange={setNumber} />
        </SettingsBlock>
        <SettingsBlock query={query} title="Textarea" className="flex flex-col gap-2">
          <ResizableTextarea
            className={`${fieldClass()} min-h-20 font-mono`}
            value={area}
            onChange={(e) => setArea(e.target.value)}
            spellCheck={false}
          />
        </SettingsBlock>
        <SettingsBlock query={query} title="Folder" terms="browse path directory" className="flex flex-col gap-2">
          <FolderField value={folder} onChange={setFolder} placeholder="Folder path" />
        </SettingsBlock>
        <SettingsBlock query={query} title="Folder list" terms="extra roots grip" className="flex flex-col gap-2">
          <FolderList
            items={folders}
            onChange={setFolders}
            prefix="Models"
            lockedId="local"
            livePaths={{ local: 'A:\\Projects\\_\\BlomboUI\\BlomboUI\\user\\models' }}
          />
        </SettingsBlock>
        <SettingsBlock query={query} title="Checkpoint" terms="model refresh" className="flex flex-col gap-2">
          <CheckpointField value={checkpoint} onChange={setCheckpoint} refresh />
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard query={query} title="Choices" terms="select euler chip sampler tag">
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
        <SettingsBlock query={query} title="Chip list" terms="drag reorder remove" className="flex flex-col gap-2">
          <ChipList
            value={listTags}
            onChange={setListTags}
            chipClassName={() => 'bg-bg text-ink'}
            chipLabel={(item) => item}
          />
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard query={query} title="Image drop" terms="image drop">
        <ImageDrop />
      </SettingsCard>

      <SettingsCard query={query} title="Toggles" terms="checkbox radio plain card">
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
      </SettingsCard>

      <SettingsCard query={query} title="Meters" terms="slider progress eta download meter">
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
          <DownloadMeter pct={pct} label="1.0 GB / 2.2 GB · 18 MB/s" />
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard query={query} title="Sections" terms="advanced hires fix toggle">
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
      </SettingsCard>

      <SettingsCard query={query} title="Overlays" terms="dialog confirm context menu">
        <SettingsBlock query={query} title="Dialog" className="flex flex-wrap gap-2">
          <button type="button" className="rounded bg-accent px-2.5 py-1 text-xs text-ink" onClick={() => setDialog('dialog')}>
            Open dialog
          </button>
          <button type="button" className="rounded border border-line px-2.5 py-1 text-xs text-ink" onClick={() => setDialog('confirm')}>
            Confirm dialog
          </button>
          <button type="button" className="rounded border border-line px-2.5 py-1 text-xs text-ink" onClick={() => setMenu(true)}>
            Context menu
          </button>
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard query={query} title="Preview and metadata" terms="image tile thumbnail meta">
        <SettingsBlock query={query} title="Tile preview" className="w-36">
          <TilePreview label="Example tile" mark="?" eager />
        </SettingsBlock>
        <SettingsBlock query={query} title="Meta card" className="flex flex-col gap-2 text-xs">
          <MetaCard title="Checkpoint" mono>
            example-model.safetensors
          </MetaCard>
        </SettingsBlock>
        <SettingsBlock query={query} title="Thumbnail scopes" terms="scope global fallback auto">
          <ThumbnailScopePicker fallbackKind="loras" />
        </SettingsBlock>
      </SettingsCard>

      <SettingsCard query={query} title="Layout and icons" terms="splitter resize grip icon glyph">
        <SettingsBlock query={query} title="Pane splitter" className="flex flex-col gap-2">
          <div ref={splitterRef} className="flex h-24 min-w-0 items-stretch rounded border border-line bg-field">
            <div className="flex-1 p-2 text-xs text-muted">Resizable pane</div>
            <PaneSplitter
              value={96}
              min={64}
              containerRef={splitterRef}
              onChange={() => undefined}
              onReset={() => undefined}
            />
            <div className="w-24 bg-panel" />
          </div>
        </SettingsBlock>
        <SettingsBlock query={query} title="Resize grip" className="flex flex-col gap-2">
          <div className="relative h-32 rounded border border-line bg-field" style={{ height: panelHeight }}>
            <span className="p-2 text-xs text-muted">Drag the corner</span>
            <ResizeGrip value={panelHeight} min={64} max={240} onChange={setPanelHeight} onReset={() => setPanelHeight(128)} />
          </div>
        </SettingsBlock>
        <SettingsBlock query={query} title="Icon picker" className="flex items-center gap-2">
          <IconPicker value={glyph} onChange={setGlyph} />
          <GlyphMark value={glyph} size={16} />
          <span className="text-xs text-muted">{glyph.kind === 'icon' ? glyph.id : glyph.id}</span>
        </SettingsBlock>
      </SettingsCard>

      {dialog === 'dialog' ? (
        <Dialog onClose={() => setDialog(null)}>
          <p className="text-sm text-ink">Dialog example</p>
          <p className="mt-1.5 text-xs text-muted">The existing overlay surface.</p>
          <button type="button" className="mt-3 rounded bg-accent px-2.5 py-1 text-xs text-ink" onClick={() => setDialog(null)}>
            Close
          </button>
        </Dialog>
      ) : null}
      {dialog === 'confirm' ? (
        <ConfirmDialog
          title="Confirm example?"
          body="This uses the existing confirmation recipe."
          onClose={() => setDialog(null)}
          actions={[
            { label: 'Cancel', onClick: () => setDialog(null) },
            { label: 'Confirm', kind: 'primary', onClick: () => setDialog(null) },
          ]}
        />
      ) : null}
      {menu ? (
        <ContextMenu x={96} y={96} onClose={() => setMenu(false)}>
          <ContextMenuItem label="Example action" onClick={() => setMenu(false)} />
          <ContextMenuItem label="Danger action" danger onClick={() => setMenu(false)} />
        </ContextMenu>
      ) : null}
    </div>
  )
}
