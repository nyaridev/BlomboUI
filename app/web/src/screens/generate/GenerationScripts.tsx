import { ResizableTextarea } from '@/components/primitives/ResizableTextarea.tsx'
import { SelectField } from '@/components/primitives/SelectField.tsx'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useMemo, useState } from 'react'
import { XyPlotSettings } from './XyPlotSettings.tsx'
import { DEFAULT_XY_PLOT, type XyPlotSettings as XyPlotValue } from './xyPlot.ts'

const SCRIPTS = [
  { value: 'none', label: 'None', text: 'No script is selected.' },
  { value: 'xy-plot', label: 'X/Y Plot', text: '' },
  { value: 'prompt-matrix', label: 'Prompt Matrix', text: '' },
]

const INSERT_OPTIONS = [
  { value: 'start', label: 'Start' },
  { value: 'end', label: 'End' },
  { value: 'prompt_sr', label: 'Prompt S/R' },
]

const TARGET_OPTIONS = [
  { value: 'prompt', label: 'Positive' },
  { value: 'negative', label: 'Negative' },
]

export type PromptMatrixMode = 'start' | 'end' | 'prompt_sr'
export type PromptMatrixTarget = 'prompt' | 'negative'

export type PromptMatrixSettings = {
  lines: string
  saveGrid: boolean
  useBatch: boolean
  mode: PromptMatrixMode
  target: PromptMatrixTarget
  search: string
}

export type { XyPlotValue as XyPlotSettings }

const DEFAULT_PROMPT_MATRIX: PromptMatrixSettings = {
  lines: '',
  saveGrid: true,
  useBatch: true,
  mode: 'end',
  target: 'prompt',
  search: '',
}

function promptTags(prompt: string, negative: string) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const text of [prompt, negative]) {
    for (const part of text.split(',')) {
      const tag = part.trim()
      const key = tag.toLowerCase()
      if (!tag || seen.has(key)) {
        continue
      }
      seen.add(key)
      out.push(tag)
    }
  }
  return out
}

function matrixHint(value: PromptMatrixSettings) {
  if (value.mode === 'prompt_sr') {
    return 'Each non-empty line replaces the selected tag in both prompts.'
  }
  const where = value.target === 'negative' ? 'negative prompt' : 'prompt'
  if (value.mode === 'start') {
    return `Each non-empty line is added to the start of the ${where}.`
  }
  return `Each non-empty line is added to the end of the ${where}.`
}

export function GenerationScripts({
  onPromptMatrix,
  onXyPlot,
  workflowParams,
  comfyOk,
}: {
  onPromptMatrix: (value: PromptMatrixSettings | null) => void
  onXyPlot: (value: XyPlotValue | null) => void
  workflowParams: string[]
  comfyOk: boolean
}) {
  const [script, setScript] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [promptMatrix, setPromptMatrix] = useState(DEFAULT_PROMPT_MATRIX)
  const [xyPlot, setXyPlot] = useState(DEFAULT_XY_PLOT)
  const prompt = useGenerateStore((s) => s.prompt)
  const negativePrompt = useGenerateStore((s) => s.negativePrompt)
  const searchTags = useMemo(() => promptTags(prompt, negativePrompt), [negativePrompt, prompt])
  const selected = SCRIPTS.find((item) => item.value === script) ?? SCRIPTS[0]

  function updatePromptMatrix(patch: Partial<PromptMatrixSettings>) {
    const next = { ...promptMatrix, ...patch }
    setPromptMatrix(next)
    onPromptMatrix(next)
  }

  function updateXyPlot(next: XyPlotValue) {
    setXyPlot(next)
    onXyPlot(next)
  }

  return (
    <div className="rounded border border-line bg-field">
      <div className="px-2 py-1.5">
        <SelectField
          value={script}
          className="scripts-select-placeholder"
          onChange={(value) => {
            const next = value === 'none' ? '' : value
            setScript(next)
            setExpanded(true)
            if (next === 'prompt-matrix') {
              onXyPlot(null)
              onPromptMatrix(promptMatrix)
              return
            }
            if (next === 'xy-plot') {
              onPromptMatrix(null)
              onXyPlot(xyPlot)
              return
            }
            onPromptMatrix(null)
            onXyPlot(null)
          }}
          options={SCRIPTS}
          placeholder="Scripts"
          chevron="expand"
          expanded={expanded}
          onExpand={() => setExpanded((value) => !value)}
        />
      </div>
      {expanded ? (
        <div className="border-t border-line">
          <div className="section-body p-2">
            {selected.value === 'prompt-matrix' ? (
              <div className="flex flex-col gap-3">
                <div className="scripts-select-placeholder grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-start gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs text-muted">Insert</span>
                    <SelectField
                      value={promptMatrix.mode}
                      onChange={(mode) => updatePromptMatrix({ mode: mode as PromptMatrixMode })}
                      options={INSERT_OPTIONS}
                    />
                  </div>
                  {promptMatrix.mode === 'prompt_sr' ? (
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs text-muted">Tag</span>
                      <SelectField
                        value={promptMatrix.search}
                        onChange={(search) => updatePromptMatrix({ search })}
                        options={searchTags}
                        allowCustom
                        placeholder="Select or type a tag…"
                      />
                    </div>
                  ) : (
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs text-muted">Apply to</span>
                      <SelectField
                        value={promptMatrix.target}
                        onChange={(target) => updatePromptMatrix({ target: target as PromptMatrixTarget })}
                        options={TARGET_OPTIONS}
                      />
                    </div>
                  )}
                </div>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">Prompt lines</span>
                  <ResizableTextarea
                    value={promptMatrix.lines}
                    onChange={(event) => updatePromptMatrix({ lines: event.target.value })}
                    placeholder={'One prompt addition per line\nblack hair,\nblonde hair,'}
                    spellCheck={false}
                    className="min-h-20 rounded border border-line bg-bg px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
                  />
                  <span className="text-xs text-muted">{matrixHint(promptMatrix)}</span>
                </label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="check"
                      checked={promptMatrix.saveGrid}
                      onChange={(event) => updatePromptMatrix({ saveGrid: event.target.checked })}
                    />
                    Save a Prompt Matrix grid
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="check"
                      checked={promptMatrix.useBatch}
                      onChange={(event) => updatePromptMatrix({ useBatch: event.target.checked })}
                    />
                    Use batch count/size for each line
                  </label>
                </div>
              </div>
            ) : selected.value === 'xy-plot' ? (
              <XyPlotSettings value={xyPlot} onChange={updateXyPlot} workflowParams={workflowParams} comfyOk={comfyOk} />
            ) : (
              <p className="text-sm text-muted">{selected.text}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
