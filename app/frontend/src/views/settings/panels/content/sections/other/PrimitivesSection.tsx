import { ButtonControl } from '@/components/controls/button/ButtonControl.tsx'
import { ChoiceChip } from '@/components/controls/button/ChoiceChip.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { ChipInput } from '@/components/controls/chip-input/ChipInput.tsx'
import { ChipList } from '@/components/controls/chip-list/ChipList.tsx'
import { ChipSelect } from '@/components/controls/chip-select/ChipSelect.tsx'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ContextMenu, ContextMenuItem } from '@/components/composites/chrome/ContextMenu.tsx'
import { CheckRow } from '@/components/controls/check-row/CheckRow.tsx'
import { ExpandSection } from '@/components/controls/expand-section/ExpandSection.tsx'
import { FolderField } from '@/components/controls/folder-field/FolderField.tsx'
import { TextField } from '@/components/controls/input/TextField.tsx'
import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { ResizableTextarea } from '@/components/controls/textarea/ResizableTextarea.tsx'
import { DownloadMeter } from '@/components/controls/download-meter/DownloadMeter.tsx'
import { ProgressBar } from '@/components/controls/progress/ProgressBar.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { LoraStrengthSlider } from '@/components/controls/slider/LoraStrengthSlider.tsx'
import { SliderControl } from '@/components/controls/slider/SliderControl.tsx'
import { SliderField } from '@/components/controls/slider/SliderField.tsx'
import { Dialog, ConfirmDialog } from '@/components/controls/dialog/Dialog.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { RadioCard, RadioControl, RadioGroupControl } from '@/components/controls/toggle/RadioControl.tsx'
import { SwitchControl } from '@/components/controls/toggle/SwitchControl.tsx'
import { IconPicker } from '@/components/composites/chrome/IconPicker.tsx'
import { GlyphMark } from '@/components/composites/chrome/GlyphMark.tsx'
import { CUSTOM_GLYPH, type Glyph } from '@/components/composites/chrome/glyph.ts'
import { PaneSplitter } from '@/components/controls/resizable-panel/PaneSplitter.tsx'
import { ResizeGrip } from '@/components/controls/resizable-panel/ResizeGrip.tsx'
import { TabsList, TabsTrigger } from '@/components/controls/tabs/TabsControl.tsx'
import { MetaCard } from '@/components/composites/models/MetaCard.tsx'
import { TilePreview } from '@/components/composites/models/TilePreview.tsx'
import { CheckpointField } from '@/components/composites/models/CheckpointField.tsx'
import { ModelPickTile } from '@/components/composites/models/ModelPickTile.tsx'
import { ImageDrop } from '@/components/controls/image-drop/ImageDrop.tsx'
import { SettingsBlock, SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { useRef, useState } from 'react'

const CATEGORIES = ['Buttons', 'Fields', 'Choices', 'Toggles', 'Meters', 'Overlays', 'Layout', 'Media'] as const
type Category = (typeof CATEGORIES)[number]

export function PrimitivesSection({ query = '' }: { query?: string }) {
  const [category, setCategory] = useState<Category>('Buttons')
  const [text, setText] = useState('1girl, black hair')
  const [number, setNumber] = useState(20)
  const [area, setArea] = useState('')
  const [choice, setChoice] = useState('euler')
  const [checkpoint, setCheckpoint] = useState('')
  const [slider, setSlider] = useState(4)
  const [lora, setLora] = useState(1)
  const [pct, setPct] = useState(27)
  const [hires, setHires] = useState(true)
  const [picks, setPicks] = useState<string[]>(['euler'])
  const [tags, setTags] = useState<string[]>(['1girl'])
  const [listTags, setListTags] = useState<string[]>(['first', 'second'])
  const [folder, setFolder] = useState('A:\\Projects\\models')
  const [glyph, setGlyph] = useState<Glyph>(CUSTOM_GLYPH)
  const [dialog, setDialog] = useState<'dialog' | 'confirm' | null>(null)
  const [menu, setMenu] = useState(false)
  const [panelHeight, setPanelHeight] = useState(128)
  const [checkOn, setCheckOn] = useState(true)
  const [radio, setRadio] = useState('on')
  const [card, setCard] = useState('on')
  const [switched, setSwitched] = useState(true)
  const [tab, setTab] = useState('one')
  const [hiresTab, setHiresTab] = useState(true)
  const [segment, setSegment] = useState<'galleries' | 'images'>('galleries')
  const [media, setMedia] = useState<'all' | 'image' | 'video'>('all')
  const splitterRef = useRef<HTMLDivElement>(null)
  const eta = Math.max(0, Math.round((100 - pct) * 0.45))

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div className="flex flex-wrap gap-cluster">
        {CATEGORIES.map((item) => (
          <ChoiceChip key={item} active={category === item} className="h-toolbar px-3" onClick={() => setCategory(item)}>
            {item}
          </ChoiceChip>
        ))}
      </div>

      {category === 'Buttons' ? (
        <SettingsCard query={query} title="Buttons">
          <SettingsBlock query={query} title="Tones" className="flex flex-wrap gap-stack">
            <ButtonControl tone="generate">Generate</ButtonControl>
            <ButtonControl tone="accent">Accent</ButtonControl>
            <ButtonControl tone="muted">Muted</ButtonControl>
            <ButtonControl tone="danger">Danger</ButtonControl>
            <ButtonControl tone="accent" disabled>
              Disabled
            </ButtonControl>
            <ButtonControl tone="ghost" size="sm">
              Ghost
            </ButtonControl>
          </SettingsBlock>
          <SettingsBlock query={query} title="Sizes" className="flex flex-wrap items-end gap-stack">
            <ButtonControl size="sm">Small</ButtonControl>
            <ButtonControl size="md">Medium</ButtonControl>
            <ButtonControl size="lg">Large</ButtonControl>
            <ButtonControl size="xl">XL</ButtonControl>
          </SettingsBlock>
          <SettingsBlock query={query} title="Icon" className="flex flex-wrap gap-cluster">
            <IconButton aria-label="Random seed">
              <AppIcon id="shuffle" />
            </IconButton>
            <IconButton aria-label="Restore last seed">
              <AppIcon id="rotate-ccw" />
            </IconButton>
            <IconButton aria-label="Swap width and height">
              <AppIcon id="arrow-up-down" />
            </IconButton>
            <IconButton aria-label="Refresh">
              <AppIcon id="refresh-cw" />
            </IconButton>
            <IconButton aria-label="Close">
              <AppIcon id="x" />
            </IconButton>
            <IconButton on aria-label="On" aria-pressed>
              <AppIcon id="globe" />
            </IconButton>
            <IconButton aria-label="Disabled" disabled>
              <AppIcon id="shuffle" />
            </IconButton>
            <IconButton tone="ghost" aria-label="Reset to default">
              <AppIcon id="undo-2" size={14} />
            </IconButton>
          </SettingsBlock>
        </SettingsCard>
      ) : null}

      {category === 'Fields' ? (
        <SettingsCard query={query} title="Fields">
          <SettingsBlock query={query} title="Text" className="flex flex-col gap-2">
            <TextField value={text} onChange={(event) => setText(event.target.value)} />
          </SettingsBlock>
          <SettingsBlock query={query} title="Number" className="flex flex-col gap-2">
            <NumberField value={number} onChange={setNumber} />
          </SettingsBlock>
          <SettingsBlock query={query} title="Textarea" className="flex flex-col gap-2">
            <ResizableTextarea
              className="min-h-20 w-full rounded border border-line bg-field px-2 py-1.5 font-mono text-sm text-ink outline-none focus:border-accent"
              value={area}
              onChange={(event) => setArea(event.target.value)}
              spellCheck={false}
            />
          </SettingsBlock>
          <SettingsBlock query={query} title="Folder" terms="browse path directory" className="flex flex-col gap-2">
            <FolderField value={folder} onChange={setFolder} placeholder="Folder path" />
          </SettingsBlock>
          <SettingsBlock query={query} title="Checkpoint" terms="model refresh" className="flex flex-col gap-2">
            <CheckpointField value={checkpoint} onChange={setCheckpoint} refresh />
          </SettingsBlock>
        </SettingsCard>
      ) : null}

      {category === 'Choices' ? (
        <SettingsCard query={query} title="Choices">
          <SettingsBlock query={query} title="Select" className="flex flex-col gap-2">
            <SelectField value={choice} onChange={setChoice} options={['euler', 'euler_a', 'dpmpp_2m']} />
          </SettingsBlock>
          <SettingsBlock query={query} title="Chip select" className="flex flex-col gap-2">
            <ChipSelect
              options={['euler', 'euler_a', 'dpmpp_2m', 'dpmpp_sde', 'uni_pc']}
              value={picks}
              onChange={setPicks}
              placeholder="Add sampler…"
            />
          </SettingsBlock>
          <SettingsBlock query={query} title="Chip input" className="flex flex-col gap-2">
            <ChipInput value={tags} onChange={setTags} placeholder="Type a tag and press Enter…" />
          </SettingsBlock>
          <SettingsBlock query={query} title="Chip list" className="flex flex-col gap-2">
            <ChipList value={listTags} onChange={setListTags} chipClassName={() => 'bg-bg text-ink'} chipLabel={(item) => item} />
          </SettingsBlock>
          <SettingsBlock query={query} title="Choice chip" className="flex gap-cluster">
            <ChoiceChip active>On</ChoiceChip>
            <ChoiceChip>Off</ChoiceChip>
          </SettingsBlock>
          <SettingsBlock query={query} title="Segment switch" className="flex flex-wrap gap-cluster">
            <SegmentSwitch
              value={media}
              tone="blue"
              options={[
                { id: 'all', label: 'All' },
                { id: 'image', label: 'Images' },
                { id: 'video', label: 'Videos' },
              ]}
              onChange={setMedia}
            />
            <SegmentSwitch
              value={segment}
              tone="purple"
              options={[
                { id: 'galleries', label: 'Galleries' },
                { id: 'images', label: 'Images' },
              ]}
              onChange={setSegment}
            />
          </SettingsBlock>
        </SettingsCard>
      ) : null}

      {category === 'Toggles' ? (
        <SettingsCard query={query} title="Toggles">
          <SettingsBlock query={query} title="Checkbox" className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-ink">
              <CheckboxControl checked={checkOn} onChange={setCheckOn} />
              On
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <CheckboxControl checked={!checkOn} onChange={(value) => setCheckOn(!value)} />
              Off
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              <CheckboxControl checked disabled onChange={() => undefined} />
              Disabled
            </label>
          </SettingsBlock>
          <SettingsBlock query={query} title="Radio" className="flex flex-col gap-3">
            <RadioGroupControl value={radio} onChange={setRadio} className="flex gap-6">
              <label className="flex items-center gap-2 text-sm text-ink">
                <RadioControl value="on" />
                On
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <RadioControl value="off" />
                Off
              </label>
            </RadioGroupControl>
            <RadioGroupControl value={card} onChange={setCard} className="flex gap-2">
              <RadioCard value="on">On</RadioCard>
              <RadioCard value="off">Off</RadioCard>
            </RadioGroupControl>
          </SettingsBlock>
          <SettingsBlock query={query} title="Switch" className="flex items-center gap-6">
            <SwitchControl checked={switched} onChange={setSwitched} />
            <SwitchControl checked={!switched} onChange={(value) => setSwitched(!value)} />
            <SwitchControl checked disabled onChange={() => undefined} />
          </SettingsBlock>
        </SettingsCard>
      ) : null}

      {category === 'Meters' ? (
        <SettingsCard query={query} title="Meters">
          <SettingsBlock query={query} title="Slider" className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <SliderControl value={slider} onChange={setSlider} min={1} max={20} step={0.5} />
              <span className="w-8 shrink-0 text-right text-sm text-muted">{slider}</span>
            </div>
            <SliderField label="With number" value={slider} onChange={setSlider} min={1} max={20} step={0.5} />
          </SettingsBlock>
          <SettingsBlock query={query} title="LoRA strength" className="flex flex-col gap-2">
            <LoraStrengthSlider label="LoRA strength" value={lora} onChange={setLora} min={-2} max={2} />
          </SettingsBlock>
          <SettingsBlock query={query} title="Progress" className="flex flex-col gap-4">
            <SliderControl value={pct} onChange={setPct} min={0} max={100} />
            <ProgressBar pct={pct} label={`${pct}% ETA: ${eta}s`} />
            <ProgressBar
              pct={Math.max(0, Math.min(100, pct))}
              label="Hires. fix · 8 / 15"
              segments={['Generation', 'Upscaling', 'Hires. fix']}
            />
            <DownloadMeter pct={pct} label="1.0 GB / 2.2 GB · 18 MB/s" />
          </SettingsBlock>
        </SettingsCard>
      ) : null}

      {category === 'Overlays' ? (
        <SettingsCard query={query} title="Overlays">
          <SettingsBlock query={query} title="Dialog" className="flex flex-wrap gap-stack">
            <ButtonControl size="sm" onClick={() => setDialog('dialog')}>
              Open dialog
            </ButtonControl>
            <ButtonControl tone="ghost" size="sm" onClick={() => setDialog('confirm')}>
              Confirm dialog
            </ButtonControl>
            <ButtonControl tone="ghost" size="sm" onClick={() => setMenu(true)}>
              Context menu
            </ButtonControl>
          </SettingsBlock>
        </SettingsCard>
      ) : null}

      {category === 'Layout' ? (
        <SettingsCard query={query} title="Layout">
          <SettingsBlock query={query} title="Tabs" className="flex flex-col gap-2">
            <TabsList value={tab} onValueChange={setTab} className="flex gap-cluster">
              <TabsTrigger value="one" active={tab === 'one'}>
                One
              </TabsTrigger>
              <TabsTrigger value="two" active={tab === 'two'}>
                Two
              </TabsTrigger>
            </TabsList>
            <div className="rounded-b-md rounded-tr-md border border-line bg-panel p-3 text-sm text-muted">
              {tab === 'one' ? 'First pane' : 'Second pane'}
            </div>
          </SettingsBlock>
          <SettingsBlock query={query} title="Tabs with checkbox" className="flex flex-col gap-2">
            <TabsList value={tab} onValueChange={setTab} className="flex gap-cluster">
              <TabsTrigger value="one" active={tab === 'one'}>
                First Pass
              </TabsTrigger>
              <TabsTrigger
                value="two"
                active={tab === 'two'}
                checked={hiresTab}
                onCheckedChange={(on) => {
                  setHiresTab(on)
                  if (on) {
                    setTab('two')
                  }
                }}
              >
                Hires. fix
              </TabsTrigger>
            </TabsList>
            <div className="rounded-b-md rounded-tr-md border border-line bg-panel p-3 text-sm text-muted">
              {tab === 'one' ? 'First pass' : 'Hires. fix'}
            </div>
          </SettingsBlock>
          <SettingsBlock query={query} title="Check row" className="flex flex-col gap-2">
            <CheckRow on={hires} onChange={setHires}>
              <span className="text-sm text-ink">Model override</span>
            </CheckRow>
            <CheckRow on={hires} onChange={setHires} tone="field">
              <span className="text-sm text-ink">Field tone</span>
            </CheckRow>
          </SettingsBlock>
          <SettingsBlock query={query} title="Section" className="flex flex-col gap-2">
            <ExpandSection title="Advanced">
              <p className="text-sm text-muted">Extra settings go here.</p>
            </ExpandSection>
            <ExpandSection title="Hires fix" enabled={hires} onEnabled={setHires}>
              <div className="flex flex-col gap-stack">
                <NumberField value={number} onChange={setNumber} />
                <SelectField value={choice} onChange={setChoice} options={['euler', 'euler_a', 'dpmpp_2m']} />
              </div>
            </ExpandSection>
            <div className="rounded border border-line bg-field p-2">
              <ExpandSection title="Overrides" tone="inset" defaultOpen>
                <p className="text-sm text-muted">Nested well: panel header, bg body.</p>
              </ExpandSection>
            </div>
          </SettingsBlock>
          <SettingsBlock query={query} title="Pane splitter" className="flex flex-col gap-2">
            <div ref={splitterRef} className="flex h-24 min-w-0 items-stretch rounded border border-line bg-field">
              <div className="flex-1 p-2 text-xs text-muted">Resizable pane</div>
              <PaneSplitter value={96} min={64} containerRef={splitterRef} onChange={() => undefined} onReset={() => undefined} />
              <div className="w-24 bg-panel" />
            </div>
          </SettingsBlock>
          <SettingsBlock query={query} title="Resize grip" className="flex flex-col gap-2">
            <div className="relative h-32 rounded border border-line bg-field" style={{ height: panelHeight }}>
              <span className="p-2 text-xs text-muted">Drag the corner</span>
              <ResizeGrip value={panelHeight} min={64} max={240} onChange={setPanelHeight} onReset={() => setPanelHeight(128)} />
            </div>
          </SettingsBlock>
        </SettingsCard>
      ) : null}

      {category === 'Media' ? (
        <SettingsCard query={query} title="Media">
          <SettingsBlock query={query} title="Image drop">
            <ImageDrop />
          </SettingsBlock>
          <SettingsBlock query={query} title="Tile preview" className="w-36">
            <TilePreview label="Example tile" mark="?" eager />
          </SettingsBlock>
          <SettingsBlock query={query} title="Model pick tile" className="flex items-end gap-cluster">
            <ModelPickTile kind="checkpoints" role="Checkpoint" value={checkpoint} onChange={setCheckpoint} chromeKey="primitives-checkpoint" />
            <ModelPickTile kind="checkpoints" role="Checkpoint" size="tall" value={checkpoint} onChange={setCheckpoint} chromeKey="primitives-checkpoint" />
          </SettingsBlock>
          <SettingsBlock query={query} title="Meta card" className="flex flex-col gap-2 text-xs">
            <MetaCard title="Checkpoint" mono>
              example-model.safetensors
            </MetaCard>
          </SettingsBlock>
          <SettingsBlock query={query} title="Icon picker" className="flex items-center gap-2">
            <IconPicker value={glyph} onChange={setGlyph} />
            <GlyphMark value={glyph} size={16} />
            <span className="text-xs text-muted">{glyph.kind === 'icon' ? glyph.id : glyph.id}</span>
          </SettingsBlock>
        </SettingsCard>
      ) : null}

      {dialog === 'dialog' ? (
        <Dialog onClose={() => setDialog(null)}>
          <p className="text-sm text-ink">Dialog example</p>
          <p className="mt-1.5 text-xs text-muted">The existing overlay surface.</p>
          <ButtonControl size="sm" className="mt-3" onClick={() => setDialog(null)}>
            Close
          </ButtonControl>
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
