import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { ChipSelect, type ChipSection } from '@/components/primitives/ChipSelect.tsx'
import { ResizableTextarea } from '@/components/primitives/ResizableTextarea.tsx'
import { SelectField } from '@/components/primitives/SelectField.tsx'
import { SliderField } from '@/components/primitives/SliderField.tsx'
import {
  clampLora,
  loraRange,
  modelFileName,
} from '@/components/models/modelInfoLayouts.ts'
import { usePromptWeightKey } from '@/lib/prompt/weight.ts'
import { formatUnix } from '@/lib/timeDisplay.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function fileName(path: string) {
  return modelFileName(path)
}

function hashValue(value: string, hashing: boolean) {
  if (value) {
    return value
  }
  return hashing ? 'Computing…' : '—'
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <div className="h-7 w-full min-w-0 overflow-x-auto rounded border border-line bg-bg px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex h-full w-max items-center font-mono text-sm whitespace-nowrap text-ink">{value}</div>
      </div>
    </div>
  )
}

function Area({
  label,
  value,
  onChange,
  weight,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  weight?: boolean
}) {
  const onKeyDown = usePromptWeightKey(onChange)
  return (
    <div className="flex w-full min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <ResizableTextarea
        className="min-h-16 w-full rounded border border-line bg-bg px-2 py-1 font-mono text-sm text-ink outline-none focus:border-accent"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={weight ? onKeyDown : undefined}
        spellCheck={false}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="border-b border-line pb-1 text-xs font-medium text-ink">{title}</h3>
      {children}
    </section>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <div className="min-w-0 rounded border border-line p-3">{children}</div>
}

const ICON_BTN = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line hover:text-ink'

export function ModelInfoHeader({
  title,
  showCivitai,
  canDownload,
  pulling,
  onFileInfo,
  onCivitai,
  onClose,
}: {
  title: string
  showCivitai: boolean
  canDownload: boolean
  pulling: boolean
  onFileInfo: () => void
  onCivitai: () => void
  onClose: () => void
}) {
  return (
    <div className="-mx-3 -mt-3 flex items-center gap-2 border-b border-line px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{title}</span>
      {showCivitai ? (
        <>
          <button type="button" className={ICON_BTN} aria-label="File info" title="File info" onClick={onFileInfo}>
            <AppIcon id="info" />
          </button>
          <button
            type="button"
            className={`${ICON_BTN} disabled:opacity-40`}
            aria-label="Download from Civitai"
            title="Download from Civitai"
            disabled={!canDownload || pulling}
            onClick={onCivitai}
          >
            <AppIcon id="download" />
          </button>
        </>
      ) : null}
      <button type="button" className={ICON_BTN} aria-label="Close" onClick={onClose}>
        <AppIcon id="x" />
      </button>
    </div>
  )
}

export function ModelInfoActions({
  menuRef,
  pickerRef,
  previewOpen,
  onTogglePreview,
  viewedImageUrl,
  onFromGeneration,
  onFromFile,
  canClear,
  onClear,
  onPickFile,
  dirty,
  saving,
  onCancel,
  onSave,
}: {
  menuRef: RefObject<HTMLDivElement | null>
  pickerRef: RefObject<HTMLInputElement | null>
  previewOpen: boolean
  onTogglePreview: () => void
  viewedImageUrl: string
  onFromGeneration: () => void
  onFromFile: () => void
  canClear: boolean
  onClear: () => void
  onPickFile: (file: File) => void
  dirty: boolean
  saving: boolean
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="flex gap-2">
      <button type="button" className="flex-1 rounded px-2.5 py-1.5 text-sm text-muted hover:bg-line hover:text-ink" onClick={onCancel}>
        Cancel
      </button>
      <div ref={menuRef} className="relative flex-1">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-muted hover:bg-line hover:text-ink"
          aria-haspopup="menu"
          aria-expanded={previewOpen}
          onClick={onTogglePreview}
        >
          Replace Preview
          <AppIcon id={previewOpen ? 'chevron-up' : 'chevron-down'} size={12} />
        </button>
        {previewOpen ? (
          <ul className="select-menu bottom-[calc(100%+0.25rem)] !top-auto">
            <li>
              <button
                type="button"
                disabled={!viewedImageUrl}
                title={viewedImageUrl ? undefined : 'No image on the Generate tab'}
                className="disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
                onClick={onFromGeneration}
              >
                From Generation
              </button>
            </li>
            <li>
              <button type="button" onClick={onFromFile}>
                From File
              </button>
            </li>
            <li>
              <button
                type="button"
                disabled={!canClear}
                title={canClear ? undefined : 'No preview to clear'}
                className="disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
                onClick={onClear}
              >
                Clear Preview
              </button>
            </li>
          </ul>
        ) : null}
      </div>
      <input
        ref={pickerRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            onPickFile(file)
          }
          event.target.value = ''
        }}
      />
      <button
        type="button"
        className="flex-1 rounded bg-accent px-2.5 py-1.5 text-sm text-ink disabled:opacity-40"
        disabled={!dirty || saving}
        onClick={onSave}
      >
        Save
      </button>
    </div>
  )
}

type Hashes = { sha256: string; autov1: string; autov2: string; autov3: string }

type ViewProps = {
  path: string
  size: number
  edited: number
  hashes: Hashes
  hashing: boolean
  showHashes: boolean
  types: string[]
  onTypes: (value: string[]) => void
  pickerOptions: string[] | ChipSection[]
  notes: string
  onNotes: (value: string) => void
  lora: boolean
  prompt: string
  onPrompt: (value: string) => void
  strength: number
  onStrength: (value: number) => void
  slider: boolean
  onSlider: (value: boolean) => void
  strengthMin: number
  strengthMax: number
  sliderMin: number
  sliderMax: number
  autoApply: boolean
  autoApplyOverride: boolean | null
  onAutoApply: (value: boolean) => void
  onAutoApplyInherit: () => void
  applyAt: 'start' | 'end'
  applyAtOverride: 'start' | 'end' | null
  onApplyAt: (value: 'start' | 'end') => void
  onApplyAtInherit: () => void
  fileKind?: string
  preview: ReactNode
}

function FileFacts({ path, size, edited }: { path: string; size: number; edited: number }) {
  const timeDisplay = useSettingsStore((s) => s.timeDisplay)
  return (
    <>
      <Field label="Path" value={path} />
      <Field label="Filename" value={fileName(path)} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size" value={size ? formatSize(size) : '—'} />
        <Field label="Modified" value={formatUnix(edited, timeDisplay) || '—'} />
      </div>
    </>
  )
}

function HashFields({ hashes, hashing }: { hashes: Hashes; hashing: boolean }) {
  return (
    <Card>
      <div className="flex flex-col gap-1.5">
        <h3 className="border-b border-line pb-1 text-xs font-medium text-ink">Hashes</h3>
        <Field label="SHA256" value={hashValue(hashes.sha256, hashing)} />
        <Field label="AutoV1" value={hashValue(hashes.autov1, hashing)} />
        <Field label="AutoV2" value={hashValue(hashes.autov2, hashing)} />
        <Field label="AutoV3" value={hashValue(hashes.autov3, hashing)} />
      </div>
    </Card>
  )
}

function StaticBlock(props: ViewProps) {
  return (
    <Section title="File">
      <div className="flex flex-col gap-1.5">
        <FileFacts path={props.path} size={props.size} edited={props.edited} />
        <div className={props.showHashes ? '' : 'invisible'}>
          <HashFields hashes={props.hashes} hashing={props.hashing} />
        </div>
      </div>
    </Section>
  )
}

function StrengthCard(props: ViewProps) {
  const [min, max] = props.slider ? loraRange(props.sliderMin, props.sliderMax) : loraRange(props.strengthMin, props.strengthMax)
  return (
    <Card>
      <div className="flex flex-col gap-1.5">
        <h3 className="border-b border-line pb-1 text-xs font-medium text-ink">Strength</h3>
        <div className="flex items-end gap-3">
          <label className="flex shrink-0 items-center gap-2 pb-1 text-sm text-ink">
            <input
              type="checkbox"
              className="check"
              checked={props.slider}
              onChange={(event) => {
                const next = event.target.checked
                const range = next
                  ? loraRange(props.sliderMin, props.sliderMax)
                  : loraRange(props.strengthMin, props.strengthMax)
                props.onSlider(next)
                props.onStrength(clampLora(props.strength, range[0], range[1]))
              }}
            />
            Slider LoRA
          </label>
          <div className="min-w-0 flex-1">
            <SliderField value={props.strength} onChange={props.onStrength} min={min} max={max} step={0.05} />
          </div>
        </div>
      </div>
    </Card>
  )
}

function AutoApplyCard(props: ViewProps) {
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <h3 className="border-b border-line pb-1 text-xs font-medium text-ink">Automatic LoRA</h3>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="check"
              checked={props.autoApply}
              onChange={(event) => props.onAutoApply(event.target.checked)}
            />
            Instant LoRA
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">
              {props.autoApplyOverride === null ? 'Global default' : 'Custom'}
            </span>
            <button
              type="button"
              className="rounded border border-line px-2 py-1 text-xs text-muted hover:bg-line disabled:cursor-default disabled:opacity-40"
              disabled={props.autoApplyOverride === null}
              onClick={props.onAutoApplyInherit}
            >
              Use global
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-40 flex-1 flex-col gap-0.5">
            <span className="text-xs text-muted">Apply triggers at</span>
            <SelectField
              value={props.applyAt}
              options={[
                { value: 'start', label: 'Start' },
                { value: 'end', label: 'End' },
              ]}
              onChange={(value) => props.onApplyAt(value === 'end' ? 'end' : 'start')}
            />
          </div>
          <div className="flex items-center gap-2 pt-4">
            <span className="text-xs text-muted">
              {props.applyAtOverride === null ? 'Global default' : 'Custom'}
            </span>
            <button
              type="button"
              className="rounded border border-line px-2 py-1 text-xs text-muted hover:bg-line disabled:cursor-default disabled:opacity-40"
              disabled={props.applyAtOverride === null}
              onClick={props.onApplyAtInherit}
            >
              Use global
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function EditBlock(props: ViewProps) {
  return (
    <Section title="Model">
      {props.fileKind ? <Field label="Type" value={props.fileKind} /> : null}
      <ChipSelect options={props.pickerOptions} value={props.types} onChange={props.onTypes} placeholder="Assign types…" />
      {props.lora ? (
        <>
          <Area label="Trigger words" value={props.prompt} onChange={props.onPrompt} weight />
          <StrengthCard {...props} />
          <AutoApplyCard {...props} />
        </>
      ) : null}
      <Area label="Notes" value={props.notes} onChange={props.onNotes} />
    </Section>
  )
}

function Cover({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ height: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const node = ref.current
    const side = node?.nextElementSibling
    if (!node || !(side instanceof HTMLElement)) {
      return
    }
    const height = side.getBoundingClientRect().height
    const width = (height * 2) / 3
    node.style.height = `${height}px`
    node.style.width = `${width}px`
    setBox({ height, width })
  }, [])

  return (
    <div
      ref={ref}
      className="shrink-0 overflow-hidden"
      style={box ?? { width: 0, height: 0, visibility: 'hidden' }}
    >
      <div className="h-full w-full [&>*]:h-full [&>*]:w-full [&>*]:aspect-auto">{children}</div>
    </div>
  )
}

export function ModelInfoBody(props: ViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-stretch gap-4">
        <Cover>{props.preview}</Cover>
        <div className="min-w-0 flex-1">
          <StaticBlock {...props} />
        </div>
      </div>
      <EditBlock {...props} />
    </div>
  )
}
