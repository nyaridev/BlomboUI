import { type ReactNode } from 'react'
import { ModelTileRow } from './ModelTileRow.tsx'
import { type ModelTileStyle } from './modelLayouts.ts'
import { type GenerateTab } from './tabs.ts'

export function GenerateModels({
  style,
  prompt,
  actions,
  onOpenTab,
  showTextEncoder,
  showVae,
}: {
  style: ModelTileStyle
  prompt: ReactNode
  actions: ReactNode
  onOpenTab: (tab: GenerateTab) => void
  showTextEncoder: boolean
  showVae: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <ModelTileRow style={style} onOpenTab={onOpenTab} showTextEncoder={showTextEncoder} showVae={showVae} />
      <div className="flex shrink-0 items-stretch gap-3">
        {prompt}
        {actions}
      </div>
    </div>
  )
}
