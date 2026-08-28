import { type ReactNode } from 'react'
import { ModelTileRow } from '@/views/generate/panels/chrome/sections/tiles/ModelTileRow.tsx'
import { type ModelTileStyle } from '@/views/generate/panels/chrome/sections/tiles/modelLayouts.ts'
import { PromptStackPlaceholder } from '@/views/generate/panels/chrome/sections/prompt/PromptStack.tsx'
import { type GenerateTab } from '@/views/generate/panels/workspace/tabs.ts'

export function GenerateChrome({
  style,
  prompt,
  actions,
  onOpenTab,
  showTextEncoder,
  showVae,
  showModels = true,
  showPrompt = true,
}: {
  style: ModelTileStyle
  prompt: ReactNode
  actions: ReactNode
  onOpenTab: (tab: GenerateTab) => void
  showTextEncoder: boolean
  showVae: boolean
  showModels?: boolean
  showPrompt?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      {showModels ? (
        <ModelTileRow style={style} onOpenTab={onOpenTab} showTextEncoder={showTextEncoder} showVae={showVae} />
      ) : null}
      <div className="flex shrink-0 items-stretch gap-3">
        {showPrompt ? prompt : <PromptStackPlaceholder />}
        {actions}
      </div>
    </div>
  )
}
