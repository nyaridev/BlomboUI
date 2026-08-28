import { BaseModelPanel } from '@/views/generate/panels/base-model/BaseModelPanel.tsx'
import { GenerationPanel } from '@/views/generate/panels/generation/GenerationPanel.tsx'
import { LorasPanel } from '@/views/generate/panels/loras/LorasPanel.tsx'
import { OtherPanel } from '@/views/generate/panels/other/OtherPanel.tsx'
import { WildcardsPanel } from '@/views/generate/panels/wildcards/WildcardsPanel.tsx'
import { TabsList, TabsTrigger } from '@/components/controls/tabs/TabsControl.tsx'
import { selectedWildcardPaths } from '@/views/generate/panels/generation/generateHelpers.ts'
import { type Job, type ModelEntry, type ModelLists } from '@/lib/api.ts'
import { parseWildcardTags, replaceWildcardAt, toggleWildcard, wildcardMatches } from '@/lib/prompt/wildcardTags.ts'
import { useGenerateStore, type ModelSwap } from '@/stores/generateStore.ts'
import type { GenerateTab } from '@/views/generate/panels/workspace/tabs.ts'
import type { RefObject } from 'react'

type LoraItem = ModelEntry & {
  auto_apply?: boolean | null
}

export function GenerateWorkspace({
  shownTab,
  visibleTabs,
  onTab,
  swapTab,
  swapTarget,
  onSwapTarget,
  genRowRef,
  paramsWidth,
  onParamsWidth,
  warning,
  comfyOk,
  lastSeed,
  workflowParams,
  starting,
  imageIds,
  jobId,
  job,
  busy,
  progressPct,
  currentLabel,
  progressSegments,
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
  loraItems,
  activeLoraOrder,
  loraAutoApplyDefault,
  wildcardItems,
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
  warning: string | null
  comfyOk: boolean
  lastSeed: number | null
  workflowParams: string[]
  starting: boolean
  imageIds: string[]
  jobId?: string
  job: Job | null
  busy: boolean
  progressPct: number
  currentLabel: string
  progressSegments?: string[]
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
  loraItems: LoraItem[]
  activeLoraOrder: string[]
  loraAutoApplyDefault: boolean
  wildcardItems: ModelEntry[]
  onToggleAutoLora: (path: string) => void
}) {
  return (
    <div className={['flex min-w-0 flex-col', shownTab !== 'Generation' ? 'flex-1' : ''].join(' ')}>
      <TabsList
        value={shownTab}
        onValueChange={(value) => {
          onTab(value as GenerateTab)
          if (swapTab && swapTab !== value) {
            onSwapTarget(null)
          }
        }}
        className="flex shrink-0 gap-cluster px-2"
      >
        {visibleTabs.map((item) => (
          <TabsTrigger key={item} value={item} active={shownTab === item}>
            {item}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className={['mb-4 rounded-b-md rounded-tr-md border border-line bg-panel p-3', shownTab !== 'Generation' ? 'flex flex-1 flex-col' : ''].join(' ')}>
        <GenerationPanel
          hidden={shownTab !== 'Generation'}
          genRowRef={genRowRef}
          paramsWidth={paramsWidth}
          onParamsWidth={onParamsWidth}
          warning={warning}
          comfyOk={comfyOk}
          lastSeed={lastSeed}
          workflowParams={workflowParams}
          starting={starting}
          imageIds={imageIds}
          jobId={jobId}
          job={job}
          busy={busy}
          progressPct={progressPct}
          currentLabel={currentLabel}
          progressSegments={progressSegments}
          jobPct={jobPct}
          overallLabel={overallLabel}
          timing={timing}
        />
        {shownTab === 'Base Model' ? (
          <BaseModelPanel
            kind={baseKind}
            items={baseItems}
            itemKind={baseItemKind}
            value={baseValue}
            onSelect={(path) => {
              onCheckpoint(path)
              onSwapTarget(null)
            }}
          />
        ) : null}
        {shownTab === 'LoRa' ? (
          <LorasPanel
            items={loraItems}
            activeLoraOrder={activeLoraOrder}
            autoApplyDefault={loraAutoApplyDefault}
            swapTarget={swapTarget}
            onToggleAutoLora={onToggleAutoLora}
            onSwapTarget={onSwapTarget}
          />
        ) : null}
        {shownTab === 'Wildcards' ? (
          <WildcardGallery items={wildcardItems} swapTarget={swapTarget} onSwapTarget={onSwapTarget} />
        ) : null}
        {shownTab === 'Other' ? (
          <OtherPanel
            items={otherItems}
            itemKind={otherItemKind}
            selected={otherSelected}
            onSelect={(path) => {
              const item = otherItems.find((row) => row.path === path)
              const kind = item ? otherItemKind(item) : 'vae'
              if (kind === 'upscale_models' || kind === 'sams' || kind === 'ultralytics') {
                return
              }
              const useTextEncoder =
                swapTarget?.slot === 'textEncoder' || (swapTarget?.slot !== 'vae' && kind === 'text_encoders')
              if (useTextEncoder) {
                if (!workflowParams.includes('textEncoder')) {
                  return
                }
                onTextEncoder(path)
              } else if (!workflowParams.includes('vae')) {
                return
              } else {
                onVae(path)
              }
              onSwapTarget(null)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function WildcardGallery({
  items,
  swapTarget,
  onSwapTarget,
}: {
  items: ModelEntry[]
  swapTarget: ModelSwap | null
  onSwapTarget: (target: ModelSwap | null) => void
}) {
  const prompt = useGenerateStore((s) => s.prompt)
  const setPrompt = useGenerateStore((s) => s.setPrompt)
  const wildHits = parseWildcardTags(prompt)
  const wildFocus =
    swapTarget?.slot === 'wildcard' && swapTarget.index >= 0
      ? items.find((row) => wildcardMatches(row, wildHits[swapTarget.index]?.name ?? ''))?.path
      : undefined
  return (
    <WildcardsPanel
      items={items}
      selected={selectedWildcardPaths(prompt, items)}
      focus={wildFocus}
      onSelect={(path) => {
        const item = items.find((row) => row.path === path)
        if (!item) {
          return
        }
        if (swapTarget?.slot === 'wildcard' && swapTarget.index >= 0) {
          setPrompt(replaceWildcardAt(prompt, swapTarget.index, item))
          onSwapTarget(null)
          return
        }
        setPrompt(toggleWildcard(prompt, item))
        onSwapTarget(null)
      }}
    />
  )
}
