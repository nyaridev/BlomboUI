import { GalleryView } from '@/components/gallery/GalleryView.tsx'
import { PaneSplitter } from '@/components/chrome/PaneSplitter.tsx'
import { GenerationParams } from './GenerationParams.tsx'
import type { PromptMatrixSettings } from './GenerationScripts.tsx'
import { ImageStage } from './ImageStage.tsx'
import {
  defaultParamsWidth,
  PARAMS_MAX_RATIO,
  PARAMS_MIN_REM,
  PARAMS_RATIO,
  remPx,
  selectedLoraPaths,
  selectedWildcardPaths,
} from './generateHelpers.ts'
import { jobGridUrl, jobPreviewUrl, type Job, type ModelEntry, type ModelLists } from '@/lib/api.ts'
import { loraNameMatches, parseLoraHits, removeLoraAt, replaceLoraAt, toggleLoraPrompts } from '@/lib/prompt/loraTags.ts'
import { parseWildcardTags, replaceWildcardAt, toggleWildcard, wildcardMatches } from '@/lib/prompt/wildcardTags.ts'
import type { ModelSwap } from '@/stores/generateStore.ts'
import type { GenerateTab } from './tabs.ts'
import type { RefObject } from 'react'

type LoraItem = ModelEntry & {
  auto_apply?: boolean | null
}

export function GenerateTabs({
  shownTab,
  visibleTabs,
  onTab,
  swapTab,
  swapTarget,
  onSwapTarget,
  genRowRef,
  paramsWidth,
  onParamsWidth,
  error,
  warning,
  comfyOk,
  lastSeed,
  onPromptMatrix,
  starting,
  imageIds,
  jobId,
  job,
  busy,
  progressPct,
  currentLabel,
  jobPct,
  overallLabel,
  timing,
  baseKind,
  baseItems,
  baseItemKind,
  baseValue,
  onCheckpoint,
  onVae,
  onTextEncoder,
  otherItems,
  otherItemKind,
  otherSelected,
  prompt,
  negativePrompt,
  loraItems,
  activeLoraOrder,
  loraAutoApplyDefault,
  wildcardItems,
  onPrompt,
  onNegativePrompt,
  onToggleAutoLora,
}: {
  shownTab: GenerateTab
  visibleTabs: GenerateTab[]
  onTab: (tab: GenerateTab) => void
  swapTab: GenerateTab | null
  swapTarget: ModelSwap | null
  onSwapTarget: (target: ModelSwap | null) => void
  genRowRef: RefObject<HTMLDivElement | null>
  paramsWidth: number | null
  onParamsWidth: (value: number | null) => void
  error: string | null
  warning: string | null
  comfyOk: boolean
  lastSeed: number | null
  onPromptMatrix: (value: PromptMatrixSettings | null) => void
  starting: boolean
  imageIds: string[]
  jobId?: string
  job: Job | null
  busy: boolean
  progressPct: number
  currentLabel: string
  jobPct: number
  overallLabel: string | null
  timing: string | null
  baseKind: keyof ModelLists
  baseItems: ModelEntry[]
  baseItemKind?: (item: ModelEntry) => keyof ModelLists
  baseValue: string
  onCheckpoint: (path: string) => void
  onVae: (path: string) => void
  onTextEncoder: (path: string) => void
  otherItems: ModelEntry[]
  otherItemKind: (item: ModelEntry) => keyof ModelLists
  otherSelected: string[]
  prompt: string
  negativePrompt: string
  loraItems: LoraItem[]
  activeLoraOrder: string[]
  loraAutoApplyDefault: boolean
  wildcardItems: ModelEntry[]
  onPrompt: (value: string) => void
  onNegativePrompt: (value: string) => void
  onToggleAutoLora: (path: string) => void
}) {
  const loraHits = parseLoraHits(prompt)
  const wildHits = parseWildcardTags(prompt)
  const loraFocus =
    swapTarget?.slot === 'lora' && swapTarget.index >= 0
      ? loraItems.find((row) => loraNameMatches(loraHits[swapTarget.index]?.name ?? '', row.path))?.path
      : swapTarget?.slot === 'lora' && swapTarget.auto
        ? swapTarget.path
        : undefined
  const wildFocus =
    swapTarget?.slot === 'wildcard' && swapTarget.index >= 0
      ? wildcardItems.find((row) => wildcardMatches(row, wildHits[swapTarget.index]?.name ?? ''))?.path
      : undefined
  return (
    <div className={['flex min-w-0 flex-col', shownTab !== 'Generation' ? 'flex-1' : ''].join(' ')}>
      <div className="flex shrink-0 gap-1 px-2">
        {visibleTabs.map((item) => (
          <button
            key={item}
            type="button"
            className={[
              '-mb-px rounded-t-md border px-3 py-1.5 text-sm',
              shownTab === item ? 'border-line border-b-panel bg-panel text-ink' : 'border-transparent text-muted hover:text-ink',
            ].join(' ')}
            onClick={() => {
              onTab(item)
              if (swapTab && swapTab !== item) {
                onSwapTarget(null)
              }
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <div className={['mb-4 rounded-b-md rounded-tr-md border border-line bg-panel p-3', shownTab !== 'Generation' ? 'flex flex-1 flex-col' : ''].join(' ')}>
        <div ref={genRowRef} className={shownTab === 'Generation' ? 'flex min-w-0' : 'hidden'}>
          <div className="min-w-0 shrink-0" style={{ width: paramsWidth ?? `${PARAMS_RATIO * 100}%` }}>
            <GenerationParams
              error={error}
              warning={warning}
              comfyOk={comfyOk}
              lastSeed={lastSeed}
              onPromptMatrix={onPromptMatrix}
            />
          </div>
          <PaneSplitter
            value={paramsWidth ?? defaultParamsWidth(genRowRef.current)}
            onChange={onParamsWidth}
            onReset={() => onParamsWidth(null)}
            min={PARAMS_MIN_REM * remPx()}
            containerRef={genRowRef}
            maxRatio={PARAMS_MAX_RATIO}
          />
          <ImageStage
            images={starting ? [] : imageIds}
            gridUrls={
              !starting && jobId && (job?.grid_count || (job?.has_grid ? 1 : 0))
                ? Array.from({ length: job?.grid_count || 1 }, (_, i) => jobGridUrl(jobId, i))
                : []
            }
            gallery={starting ? [] : (job?.gallery ?? [])}
            busy={busy}
            previewUrl={
              !starting && busy && job?.has_preview && jobId
                ? jobPreviewUrl(jobId, job.preview_rev ?? job.preview_steps.at(-1) ?? 0)
                : null
            }
            progressPct={progressPct}
            progressLabel={currentLabel}
            jobProgressPct={jobPct}
            jobProgressLabel={overallLabel}
            timing={timing}
          />
        </div>
        {shownTab === 'Base Model' ? (
          <div className="flex-1">
            <GalleryView
              kind={baseKind}
              items={baseItems}
              itemKind={baseItemKind}
              value={baseValue}
              onSelect={(path) => {
                onCheckpoint(path)
                onSwapTarget(null)
              }}
            />
          </div>
        ) : null}
        {shownTab === 'LoRa' ? (
          <div className="flex-1">
            <GalleryView
              kind="loras"
              items={loraItems}
              selected={selectedLoraPaths(prompt, loraItems, activeLoraOrder, loraAutoApplyDefault)}
              focus={loraFocus}
              onSelect={(path) => {
                const item = loraItems.find((row) => row.path === path)
                const instant = Boolean(item?.auto_apply ?? loraAutoApplyDefault)
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
                  const old = hit ? loraItems.find((row) => loraNameMatches(hit.name, row.path)) : null
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
        ) : null}
        {shownTab === 'Wildcards' ? (
          <div className="flex-1">
            <GalleryView
              kind="wildcards"
              items={wildcardItems}
              selected={selectedWildcardPaths(prompt, wildcardItems)}
              focus={wildFocus}
              onSelect={(path) => {
                const item = wildcardItems.find((row) => row.path === path)
                if (!item) {
                  return
                }
                if (swapTarget?.slot === 'wildcard' && swapTarget.index >= 0) {
                  onPrompt(replaceWildcardAt(prompt, swapTarget.index, item))
                  onSwapTarget(null)
                  return
                }
                onPrompt(toggleWildcard(prompt, item))
                onSwapTarget(null)
              }}
            />
          </div>
        ) : null}
        {shownTab === 'Other' ? (
          <div className="flex-1">
            <GalleryView
              kind="vae"
              chromeKey="other"
              items={otherItems}
              itemKind={otherItemKind}
              selected={otherSelected}
              onSelect={(path) => {
                const item = otherItems.find((row) => row.path === path)
                const kind = item ? otherItemKind(item) : 'vae'
                if (swapTarget?.slot === 'textEncoder' || (swapTarget?.slot !== 'vae' && kind === 'text_encoders')) {
                  onTextEncoder(path)
                } else {
                  onVae(path)
                }
                onSwapTarget(null)
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
