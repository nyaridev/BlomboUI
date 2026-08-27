import { GalleryBrowser } from '@/components/composites/gallery/GalleryBrowser.tsx'
import type { ModelEntry } from '@/lib/api.ts'
import { loraNameMatches, parseLoraHits, removeLoraAt, replaceLoraAt, toggleLoraPrompts } from '@/lib/prompt/loraTags.ts'
import { selectedLoraPaths } from '@/views/generate/panels/generation/generateHelpers.ts'
import type { ModelSwap } from '@/stores/generateStore.ts'

type LoraItem = ModelEntry & {
  auto_apply?: boolean | null
}

export function LorasPanel({
  items,
  prompt,
  negativePrompt,
  activeLoraOrder,
  autoApplyDefault,
  swapTarget,
  onPrompt,
  onNegativePrompt,
  onToggleAutoLora,
  onSwapTarget,
}: {
  items: LoraItem[]
  prompt: string
  negativePrompt: string
  activeLoraOrder: string[]
  autoApplyDefault: boolean
  swapTarget: ModelSwap | null
  onPrompt: (value: string) => void
  onNegativePrompt: (value: string) => void
  onToggleAutoLora: (path: string) => void
  onSwapTarget: (target: ModelSwap | null) => void
}) {
  const loraHits = parseLoraHits(prompt)
  const focus =
    swapTarget?.slot === 'lora' && swapTarget.index >= 0
      ? items.find((row) => loraNameMatches(loraHits[swapTarget.index]?.name ?? '', row.path))?.path
      : swapTarget?.slot === 'lora' && swapTarget.auto
        ? swapTarget.path
        : undefined
  return (
    <div className="flex-1">
      <GalleryBrowser
        kind="loras"
        items={items}
        selected={selectedLoraPaths(prompt, items, activeLoraOrder, autoApplyDefault)}
        focus={focus}
        onSelect={(path) => {
          const item = items.find((row) => row.path === path)
          const instant = Boolean(item?.auto_apply ?? autoApplyDefault)
          if (swapTarget?.slot === 'lora' && swapTarget.auto) {
            const oldPath = swapTarget.path
            if (oldPath === path) {
              onToggleAutoLora(path)
              onSwapTarget(null)
              return
            }
            if (oldPath) {
              onToggleAutoLora(oldPath)
            }
            if (instant) {
              onToggleAutoLora(path)
            } else {
              const next = toggleLoraPrompts(
                prompt,
                negativePrompt,
                path,
                item?.prompt || '',
                item?.negative_prompt || '',
                item?.strength ?? 1,
              )
              onPrompt(next.prompt)
              onNegativePrompt(next.negativePrompt)
            }
            onSwapTarget(null)
            return
          }
          if (swapTarget?.slot === 'lora' && swapTarget.index >= 0) {
            const hit = loraHits[swapTarget.index]
            const old = hit ? items.find((row) => loraNameMatches(hit.name, row.path)) : null
            if (instant) {
              const next = removeLoraAt(prompt, negativePrompt, swapTarget.index, old?.prompt || '')
              onPrompt(next.prompt)
              onNegativePrompt(next.negativePrompt)
              onToggleAutoLora(path)
              onSwapTarget(null)
              return
            }
            const next = replaceLoraAt(
              prompt,
              negativePrompt,
              swapTarget.index,
              path,
              item?.prompt || '',
              item?.negative_prompt || '',
              hit?.strength ?? item?.strength ?? 1,
              old?.prompt || '',
              old?.negative_prompt || '',
            )
            onPrompt(next.prompt)
            onNegativePrompt(next.negativePrompt)
            onSwapTarget(null)
            return
          }
          if (instant) {
            onToggleAutoLora(path)
            onSwapTarget(null)
            return
          }
          const next = toggleLoraPrompts(
            prompt,
            negativePrompt,
            path,
            item?.prompt || '',
            item?.negative_prompt || '',
            item?.strength ?? 1,
          )
          onPrompt(next.prompt)
          onNegativePrompt(next.negativePrompt)
          onSwapTarget(null)
        }}
      />
    </div>
  )
}
