import { Chevron } from '@/components/Chevron.tsx'
import { CloseIcon } from '@/components/CloseIcon.tsx'
import { DownloadIcon } from '@/components/DownloadIcon.tsx'
import { InfoIcon } from '@/components/InfoIcon.tsx'
import { ChipSelect, type ChipSection } from '@/components/ChipSelect.tsx'
import { SliderField } from '@/components/SliderField.tsx'
import {
  clampLora,
  loraRange,
  modelFileName,
} from '@/components/modelInfoLayouts.ts'
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

function formatDate(unix: number) {
  if (!unix) {
    return '—'
  }
  return new Date(unix * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
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
      <div className="w-full min-w-0 overflow-x-auto rounded border border-line bg-bg px-2 py-1 [scrollbar-width:thin]">
        <div className="w-max font-mono text-sm whitespace-nowrap text-ink">{value}</div>
      </div>
    </div>
  )
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <textarea
        className="min-h-16 w-full resize-y rounded border border-line bg-bg px-2 py-1 font-mono text-sm text-ink outline-none focus:border-accent"
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
            <InfoIcon />
          </button>
          <button
            type="button"
            className={`${ICON_BTN} disabled:opacity-40`}
            aria-label="Download from Civitai"
            title="Download from Civitai"
            disabled={!canDownload || pulling}
            onClick={onCivitai}
          >
            <DownloadIcon />
          </button>
        </>
      ) : null}
      <button type="button" className={ICON_BTN} aria-label="Close" onClick={onClose}>
        <CloseIcon />
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
          <Chevron dir={previewOpen ? 'up' : 'down'} />
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
        accept="image/png,image/jpeg,image/webp"
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
  preview: ReactNode
}

function FileFacts({ path, size, edited }: { path: string; size: number; edited: number }) {
  return (
    <>
      <Field label="Path" value={path} />
      <Field label="Filename" value={fileName(path)} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Size" value={size ? formatSize(size) : '—'} />
        <Field label="Modified" value={formatDate(edited)} />
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
        {props.showHashes ? <HashFields hashes={props.hashes} hashing={props.hashing} /> : null}
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

function EditBlock(props: ViewProps) {
  return (
    <Section title="Model">
      <ChipSelect options={props.pickerOptions} value={props.types} onChange={props.onTypes} placeholder="Assign types…" />
      {props.lora ? (
        <>
          <Area label="Trigger words" value={props.prompt} onChange={props.onPrompt} />
          <StrengthCard {...props} />
        </>
      ) : null}
      <Area label="Notes" value={props.notes} onChange={props.onNotes} />
    </Section>
  )
}

function FittedPreview({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    const side = ref.current?.nextElementSibling
    if (!(side instanceof HTMLElement)) {
      return
    }
    const sync = () => {
      const next = Math.round(side.getBoundingClientRect().height)
      setHeight((prev) => (prev === next ? prev : next))
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(side)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="shrink-0"
      style={height ? { height, width: (height * 2) / 3 } : { width: '18rem' }}
    >
      {children}
    </div>
  )
}

export function ModelInfoBody(props: ViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-stretch gap-4">
        <FittedPreview>{props.preview}</FittedPreview>
        <div className="min-w-0 flex-1">
          <StaticBlock {...props} />
        </div>
      </div>
      <EditBlock {...props} />
    </div>
  )
}
