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

export const DEFAULT_PROMPT_MATRIX: PromptMatrixSettings = {
  lines: '',
  saveGrid: true,
  useBatch: true,
  mode: 'end',
  target: 'prompt',
  search: '',
}

export const GENERATE_SCRIPTS = ['', 'xy-plot', 'prompt-matrix'] as const
export type GenerateScript = (typeof GENERATE_SCRIPTS)[number]

export function isGenerateScript(value: unknown): value is GenerateScript {
  return value === '' || value === 'xy-plot' || value === 'prompt-matrix'
}

export function isPromptMatrixMode(value: unknown): value is PromptMatrixMode {
  return value === 'start' || value === 'end' || value === 'prompt_sr'
}

export function isPromptMatrixTarget(value: unknown): value is PromptMatrixTarget {
  return value === 'prompt' || value === 'negative'
}
