import { ResizableTextarea } from '@/components/controls/textarea/ResizableTextarea.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useEffect, useMemo, useState } from 'react'
import { XyPlotSettings } from '@/views/generate/panels/generation/sections/params/XyPlotSettings.tsx'
import {
  isGenerateScript,
  type GenerateScript,
  type PromptMatrixMode,
  type PromptMatrixSettings,
  type PromptMatrixTarget,
} from '@/views/generate/panels/generation/sections/params/promptMatrix.ts'
import { type XyPlotSettings as XyPlotValue } from '@/views/generate/panels/generation/sections/params/xyPlot.ts'

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

export type { PromptMatrixMode, PromptMatrixSettings, PromptMatrixTarget, GenerateScript }
export type { XyPlotValue as XyPlotSettings }
export { DEFAULT_PROMPT_MATRIX } from '@/views/generate/panels/generation/sections/params/promptMatrix.ts'

export type ScriptsValue = {
  script: GenerateScript
  promptMatrix: PromptMatrixSettings
  xyPlot: XyPlotValue
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
  workflowParams,
  comfyOk,
  value,
  onChange,
  locked = false,
}: {
  workflowParams: string[]
  comfyOk: boolean
  value?: ScriptsValue
  onChange?: (value: ScriptsValue) => void
  locked?: boolean
}) {
  const storeScript = useGenerateStore((s) => s.script)
  const storePromptMatrix = useGenerateStore((s) => s.promptMatrix)
  const storeXyPlot = useGenerateStore((s) => s.xyPlot)
  const setScript = useGenerateStore((s) => s.setScript)
  const setPromptMatrix = useGenerateStore((s) => s.setPromptMatrix)
  const setXyPlot = useGenerateStore((s) => s.setXyPlot)
  const prompt = useGenerateStore((s) => s.prompt)
  const negativePrompt = useGenerateStore((s) => s.negativePrompt)
  const current: ScriptsValue = value ?? {
    script: storeScript,
    promptMatrix: storePromptMatrix,
    xyPlot: storeXyPlot,
  }
  const [expanded, setExpanded] = useState(() => Boolean(current.script))
  const searchTags = useMemo(() => promptTags(prompt, negativePrompt), [negativePrompt, prompt])
  const selected = SCRIPTS.find((item) => item.value === (current.script || 'none')) ?? SCRIPTS[0]

  useEffect(() => {
    setExpanded(Boolean(current.script))
  }, [current.script])

  function commit(patch: Partial<ScriptsValue>) {
    if (locked) {
      return
    }
    const next = { ...current, ...patch }
    if (onChange) {
      onChange(next)
      return
    }
    if (patch.script !== undefined) {
      setScript(patch.script)
    }
    if (patch.promptMatrix) {
      setPromptMatrix(patch.promptMatrix)
    }
    if (patch.xyPlot) {
      setXyPlot(patch.xyPlot)
    }
  }

  function updatePromptMatrix(patch: Partial<PromptMatrixSettings>) {
    commit({ promptMatrix: { ...current.promptMatrix, ...patch } })
  }

  return (
    <div className="rounded border border-line bg-field">
      <div className="px-2 py-1.5">
        <SelectField
          value={current.script || 'none'}
          className="scripts-select-placeholder"
          onChange={(next) => {
            const script = next === 'none' || !isGenerateScript(next) ? '' : next
            setExpanded(true)
            commit({ script })
          }}
          options={SCRIPTS}
          placeholder="Scripts"
          chevron="expand"
          expanded={expanded}
          onExpand={() => setExpanded((open) => !open)}
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
                      value={current.promptMatrix.mode}
                      onChange={(mode) => updatePromptMatrix({ mode: mode as PromptMatrixMode })}
                      options={INSERT_OPTIONS}
                    />
                  </div>
                  {current.promptMatrix.mode === 'prompt_sr' ? (
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs text-muted">Tag</span>
                      <SelectField
                        value={current.promptMatrix.search}
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
                        value={current.promptMatrix.target}
                        onChange={(target) => updatePromptMatrix({ target: target as PromptMatrixTarget })}
                        options={TARGET_OPTIONS}
                      />
                    </div>
                  )}
                </div>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">Prompt lines</span>
                  <ResizableTextarea
                    value={current.promptMatrix.lines}
                    onChange={(event) => updatePromptMatrix({ lines: event.target.value })}
                    placeholder={'One prompt addition per line\nblack hair,\nblonde hair,'}
                    spellCheck={false}
                    className="min-h-20 rounded border border-line bg-bg px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
                    disabled={locked}
                  />
                  <span className="text-xs text-muted">{matrixHint(current.promptMatrix)}</span>
                </label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <CheckboxControl
                      checked={current.promptMatrix.saveGrid}
                      onChange={(checked) => updatePromptMatrix({ saveGrid: checked })}
                    />
                    Save a Prompt Matrix grid
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <CheckboxControl
                      checked={current.promptMatrix.useBatch}
                      onChange={(checked) => updatePromptMatrix({ useBatch: checked })}
                    />
                    Use batch count/size for each line
                  </label>
                </div>
              </div>
            ) : selected.value === 'xy-plot' ? (
              <XyPlotSettings
                value={current.xyPlot}
                onChange={(xyPlot) => commit({ xyPlot })}
                workflowParams={workflowParams}
                comfyOk={comfyOk}
              />
            ) : (
              <p className="text-sm text-muted">{selected.text}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
