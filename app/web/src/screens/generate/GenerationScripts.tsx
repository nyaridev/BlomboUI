import { ResizableTextarea } from '@/components/primitives/ResizableTextarea.tsx'
import { SelectField } from '@/components/primitives/SelectField.tsx'
import { useState } from 'react'

const SCRIPTS = [
  { value: 'none', label: 'None', text: 'No script is selected.' },
  { value: 'xy-plot', label: 'X/Y Plot', text: 'X/Y Plot selected. Controls will be added here.' },
  { value: 'prompt-matrix', label: 'Prompt Matrix', text: '' },
]

export type PromptMatrixSettings = {
  lines: string
  saveGrid: boolean
  useBatch: boolean
}

const DEFAULT_PROMPT_MATRIX: PromptMatrixSettings = {
  lines: '',
  saveGrid: true,
  useBatch: true,
}

export function GenerationScripts({
  onPromptMatrix,
}: {
  onPromptMatrix: (value: PromptMatrixSettings | null) => void
}) {
  const [script, setScript] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [promptMatrix, setPromptMatrix] = useState(DEFAULT_PROMPT_MATRIX)
  const selected = SCRIPTS.find((item) => item.value === script) ?? SCRIPTS[0]

  function updatePromptMatrix(patch: Partial<PromptMatrixSettings>) {
    const next = { ...promptMatrix, ...patch }
    setPromptMatrix(next)
    onPromptMatrix(next)
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
            onPromptMatrix(next === 'prompt-matrix' ? promptMatrix : null)
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
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">Prompt lines</span>
                  <ResizableTextarea
                    value={promptMatrix.lines}
                    onChange={(event) => updatePromptMatrix({ lines: event.target.value })}
                    placeholder={'One prompt addition per line\nblack hair,\nblonde hair,'}
                    spellCheck={false}
                    className="min-h-20 rounded border border-line bg-bg px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
                  />
                  <span className="text-xs text-muted">Each non-empty line is added to the base prompt.</span>
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
            ) : (
              <p className="text-sm text-muted">{selected.text}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
