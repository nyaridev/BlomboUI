import type { PromptMatrixSettings } from './GenerationScripts.tsx'
import { GenerateModels } from './GenerateModels.tsx'
import { GenerateTabs } from './GenerateTabs.tsx'
import { PromptStack } from './PromptStack.tsx'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  createJob,
  getJob,
  getLatestJob,
  interruptJob,
  type Job,
} from '@/lib/api.ts'
import { digitKey, overlayOpen } from '@/lib/hotkeys.ts'
import { autoLoraId, nextSeed, usedSeed, useGenerateStore } from '@/stores/generateStore.ts'
import { useHealthStore } from '@/stores/healthStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { GENERATE_TABS, orderedGenerateTabs, type GenerateTab } from './tabs.ts'
import {
  etaSeconds,
  formatDuration,
  idsFromJob,
  jobSeconds,
  progressLabel,
  promptMatrixLines,
  tabForSwap,
} from './generateHelpers.ts'

export function GenerateScreen() {
  const prompt = useGenerateStore((s) => s.prompt)
  const negativePrompt = useGenerateStore((s) => s.negativePrompt)
  const checkpoint = useGenerateStore((s) => s.checkpoint)
  const width = useGenerateStore((s) => s.width)
  const height = useGenerateStore((s) => s.height)
  const steps = useGenerateStore((s) => s.steps)
  const cfg = useGenerateStore((s) => s.cfg)
  const seed = useGenerateStore((s) => s.seed)
  const seedAfter = useGenerateStore((s) => s.seedAfter)
  const setSeed = useGenerateStore((s) => s.setSeed)
  const batchSize = useGenerateStore((s) => s.batchSize)
  const batchCount = useGenerateStore((s) => s.batchCount)
  const sampler = useGenerateStore((s) => s.sampler)
  const scheduler = useGenerateStore((s) => s.scheduler)
  const workflow = useGenerateStore((s) => s.workflow)
  const templateId = useGenerateStore((s) => s.templateId) || 'default'
  const outputImagePath = useGenerateStore((s) => s.outputImagePath)
  const outputGridPath = useGenerateStore((s) => s.outputGridPath)
  const outputImageName = useGenerateStore((s) => s.outputImageName)
  const outputGridName = useGenerateStore((s) => s.outputGridName)
  const modelTileStyle = useGenerateStore((s) => s.modelTileStyle)
  const activeLoraOrder = useGenerateStore((s) => s.activeLoraOrder)
  const activeLoraStrengths = useGenerateStore((s) => s.activeLoraStrengths)
  const toggleAutoLora = useGenerateStore((s) => s.toggleAutoLora)
  const setPrompt = useGenerateStore((s) => s.setPrompt)
  const setNegativePrompt = useGenerateStore((s) => s.setNegativePrompt)
  const setCheckpoint = useGenerateStore((s) => s.setCheckpoint)
  const vae = useGenerateStore((s) => s.vae)
  const textEncoder = useGenerateStore((s) => s.textEncoder)
  const setVae = useGenerateStore((s) => s.setVae)
  const setTextEncoder = useGenerateStore((s) => s.setTextEncoder)
  const swapTarget = useGenerateStore((s) => s.swapTarget)
  const setSwapTarget = useGenerateStore((s) => s.setSwapTarget)
  const batchGrid = useSettingsStore((s) => s.batchGrid)
  const batchGridMax = useSettingsStore((s) => s.batchGridMax)
  const batchGridQuality = useSettingsStore((s) => s.batchGridQuality)
  const gridFormat = useSettingsStore((s) => s.gridFormat)
  const batchGridRows = useSettingsStore((s) => s.batchGridRows)
  const batchGridFill = useSettingsStore((s) => s.batchGridFill)
  const batchGridOnCancel = useSettingsStore((s) => s.batchGridOnCancel)
  const saveInterrupted = useSettingsStore((s) => s.saveInterrupted)
  const interruptedInGrid = useSettingsStore((s) => s.interruptedInGrid)
  const hiddenGenerateTabs = useSettingsStore((s) => s.hiddenGenerateTabs)
  const generateTabOrder = useSettingsStore((s) => s.generateTabOrder)
  const generateTabKeysFollowLayout = useSettingsStore((s) => s.generateTabKeysFollowLayout)
  const loraAutoApplyDefault = useSettingsStore((s) => s.loraAutoApply)
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const loraItems = useModelsStore((s) => s.loras)
  const wildcardItems = useModelsStore((s) => s.wildcards)
  const vaeItems = useModelsStore((s) => s.vae)

  const health = useHealthStore((s) => s.health)

  const [job, setJob] = useState<Job | null>(null)
  const [imageIds, setImageIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<GenerateTab>('Generation')
  const [starting, setStarting] = useState(false)
  const [promptMatrix, setPromptMatrix] = useState<PromptMatrixSettings | null>(null)
  const genRowRef = useRef<HTMLDivElement>(null)
  const runLock = useRef(false)
  const [paramsWidth, setParamsWidth] = useState<number | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const incoming = location.state as { tab?: string } | null
    if (incoming?.tab) {
      const next = (incoming.tab === 'Lora' ? 'LoRa' : incoming.tab) as GenerateTab
      if (GENERATE_TABS.includes(next)) {
        setTab(next)
      }
    }
  }, [location.key])
  const busy = starting || job?.status === 'queued' || job?.status === 'running'
  const jobId = job?.id

  useEffect(() => {
    void getLatestJob()
      .then((latest) => {
        if (latest) {
          setJob(latest)
          setImageIds(idsFromJob(latest))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!jobId || starting) {
      return
    }
    let gone = false
    function apply(next: Job) {
      if (gone) {
        return
      }
      setJob(next)
      setImageIds(idsFromJob(next))
      if (next.status === 'failed') {
        setError(next.error || 'Generate failed')
      }
    }
    if (!busy) {
      void getJob(jobId).then(apply).catch(() => {})
      return () => {
        gone = true
      }
    }
    const timer = window.setInterval(() => {
      void getJob(jobId).then(apply).catch(() => {})
    }, 500)
    return () => {
      gone = true
      window.clearInterval(timer)
    }
  }, [jobId, busy, starting])

  const toastedMissing = useRef('')
  useEffect(() => {
    if (!busy) {
      toastedMissing.current = ''
      return
    }
    const raw = job?.payload?.wildcard_missing
    const missing = Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === 'string' && Boolean(item))
      : []
    if (!missing.length) {
      return
    }
    const key = `${job?.id}:${missing.join(',')}`
    if (toastedMissing.current === key) {
      return
    }
    toastedMissing.current = key
    toast(`Missing wildcard: ${missing.join(', ')}`, 'error')
  }, [busy, job])

  async function generate() {
    if (!checkpoint.trim()) {
      return
    }
    setError(null)
    setStarting(true)
    setImageIds([])
    const used = usedSeed(seed, seedAfter)
    const previous = seed
    const previousIds = job ? idsFromJob(job) : []
    const count = Math.max(1, Math.min(100, Math.round(Number(batchCount)) || 1))
    const activeLines = promptMatrixLines(promptMatrix?.lines)
    const activePromptMatrix = promptMatrix && activeLines.length ? promptMatrix : null
    const seedSteps = activePromptMatrix
      ? activePromptMatrix.useBatch
        ? activeLines.length * count
        : activeLines.length
      : count
    setSeed(nextSeed(used, seedAfter, seedSteps))
    try {
      const next = await createJob({
        prompt,
        negative_prompt: negativePrompt,
        checkpoint,
        width,
        height,
        steps,
        cfg: Math.max(1, cfg),
        seed: used,
        seed_after: seedAfter,
        batch_size: Math.max(1, Math.min(8, Math.round(Number(batchSize)) || 1)),
        batch_count: Math.max(1, Math.min(100, Math.round(Number(batchCount)) || 1)),
        batch_grid: activePromptMatrix ? activePromptMatrix.saveGrid : batchGrid,
        batch_grid_max: batchGridMax,
        batch_grid_quality: batchGridQuality,
        batch_grid_format: gridFormat,
        batch_grid_rows: batchGridRows,
        batch_grid_fill: batchGridFill,
        batch_grid_on_cancel: batchGridOnCancel,
        save_interrupted: saveInterrupted,
        interrupted_in_grid: interruptedInGrid,
        sampler,
        scheduler,
        workflow,
        template: templateId,
        output_image_path: outputImagePath.trim() || undefined,
        output_grid_path: outputGridPath.trim() || undefined,
        output_image_name: outputImageName.trim() || undefined,
        output_grid_name: outputGridName.trim() || undefined,
        prompt_matrix: activePromptMatrix
          ? {
              lines: activePromptMatrix.lines,
              save_grid: activePromptMatrix.saveGrid,
              use_batch: activePromptMatrix.useBatch,
            }
          : undefined,
        auto_loras: activeLoraOrder
          .filter((id) => id.startsWith(autoLoraId('')))
          .map((id) => id.slice(autoLoraId('').length))
          .filter((path) => {
            if (!path) {
              return false
            }
            const item = loraItems.find((row) => row.path === path)
            return !item || Boolean(item.auto_apply ?? loraAutoApplyDefault)
          })
          .map((path) => ({
            path,
            strength: activeLoraStrengths[path] ?? loraItems.find((row) => row.path === path)?.strength ?? 1,
          })),
      })
      setJob(next)
      setImageIds([])
    } catch (err) {
      setSeed(previous)
      setImageIds(previousIds)
      setError(err instanceof Error ? err.message : 'Generate failed')
    } finally {
      setStarting(false)
    }
  }

  async function restart() {
    if (runLock.current) {
      return
    }
    runLock.current = true
    try {
      if (busy && jobId) {
        const stopped = await interrupt('cancel')
        if (!stopped) {
          return
        }
        for (let i = 0; i < 40; i++) {
          const next = await getJob(jobId)
          setJob(next)
          setImageIds(idsFromJob(next))
          if (next.status !== 'queued' && next.status !== 'running') {
            break
          }
          await new Promise((resolve) => window.setTimeout(resolve, 150))
        }
      }
      await generate()
    } finally {
      runLock.current = false
    }
  }

  async function interrupt(mode: 'skip' | 'cancel') {
    if (!busy || !jobId) {
      return false
    }
    try {
      const next = await interruptJob(jobId, mode)
      setJob(next)
      setImageIds(idsFromJob(next))
      toast(mode === 'cancel' ? 'Generation cancelled' : 'Generation interrupted', 'info')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'cancel' ? 'Cancel failed' : 'Interrupt failed')
      return false
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat) {
        return
      }
      const digit = digitKey(event)
      if (event.altKey && !event.ctrlKey && !event.metaKey && digit && digit <= GENERATE_TABS.length) {
        event.preventDefault()
        const tabs = generateTabKeysFollowLayout
          ? orderedGenerateTabs(generateTabOrder, hiddenGenerateTabs)
          : GENERATE_TABS
        const id = tabs[digit - 1]
        if (!id || (!generateTabKeysFollowLayout && id !== 'Generation' && hiddenGenerateTabs.includes(id))) {
          return
        }
        navigate('/')
        setTab(id)
        if (tabForSwap(swapTarget) && tabForSwap(swapTarget) !== id) {
          setSwapTarget(null)
        }
        return
      }
      if (overlayOpen()) {
        return
      }
      if (event.key === 'Escape') {
        if (busy) {
          event.preventDefault()
          void interrupt('skip')
        }
        return
      }
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') {
        return
      }
      event.preventDefault()
      if (event.altKey) {
        void interrupt('cancel')
        return
      }
      if (event.shiftKey) {
        void restart()
        return
      }
      if (!busy && checkpoint.trim() && health?.comfy.reachable === true) {
        void generate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, checkpoint, generate, generateTabKeysFollowLayout, generateTabOrder, health, hiddenGenerateTabs, interrupt, navigate, restart, swapTarget])

  const comfyOk = health?.comfy.reachable === true
  const canGenerate = comfyOk && Boolean(checkpoint.trim())
  const payload = job?.payload ?? {}
  const missingLoras = Array.isArray(payload.lora_missing)
    ? payload.lora_missing.filter((item): item is string => typeof item === 'string' && Boolean(item))
    : []
  const loraWarning = missingLoras.length ? `Missing LoRA: ${missingLoras.join(', ')}` : null
  const warning = loraWarning
  const baseBatchTotal =
    Math.max(1, Number(payload.batch_size) || 1) * Math.max(1, Number(payload.batch_count) || 1)
  const matrixPayload =
    payload.prompt_matrix && typeof payload.prompt_matrix === 'object' && !Array.isArray(payload.prompt_matrix)
      ? (payload.prompt_matrix as { lines?: unknown; use_batch?: unknown })
      : null
  const matrixPayloadLines = promptMatrixLines(matrixPayload?.lines)
  const batchTotal = matrixPayloadLines.length
    ? matrixPayload?.use_batch === false
      ? matrixPayloadLines.length
      : baseBatchTotal * matrixPayloadLines.length
    : baseBatchTotal
  const batched = batchTotal > 1
  const progress = job?.progress
  const progressMax = progress?.max || 0
  const progressValue = progress?.value || 0
  const progressPct = progressMax > 0 ? Math.min(100, (progressValue / progressMax) * 100) : 0
  const jobProg = job?.job_progress
  const jobMax = jobProg?.max || 0
  const jobValue = jobProg?.value || 0
  const jobPct = jobMax > 0 ? Math.min(100, (jobValue / jobMax) * 100) : 0
  const currentLabel = batched
    ? progressMax > 0
      ? `${progressValue} / ${progressMax}`
      : 'Starting…'
    : progressLabel(progressPct, etaSeconds(job?.started_at ?? null, progressValue, progressMax))
  const overallLabel = batched
    ? progressLabel(jobPct, etaSeconds(job?.started_at ?? null, jobValue, jobMax))
    : null
  const seconds = job ? jobSeconds(job) : null
  const imageCount = imageIds.length || batchTotal
  const timing =
    seconds == null
      ? null
      : imageCount > 1
        ? `${formatDuration(seconds)} · ${formatDuration(seconds / imageCount)}/img`
        : formatDuration(seconds)
  const visibleTabs = orderedGenerateTabs(generateTabOrder, hiddenGenerateTabs)
  const shownTab = visibleTabs.includes(tab) ? tab : (visibleTabs[0] ?? 'Generation')
  const baseKind = swapTarget?.slot === 'vae' ? 'vae' : 'checkpoints'
  const baseItems = swapTarget?.slot === 'vae' ? vaeItems : checkpoints
  const baseValue =
    swapTarget?.slot === 'textEncoder' ? textEncoder : swapTarget?.slot === 'vae' ? vae : checkpoint

  return (
    <div
      data-generate-root
      className={[
        'flex min-h-full flex-col gap-3',
        shownTab === 'Generation' ? 'h-full' : '',
      ].join(' ')}
    >
      <GenerateModels
        style={modelTileStyle}
        onOpenTab={setTab}
        prompt={
          <PromptStack
            prompt={prompt}
            negativePrompt={negativePrompt}
            onPrompt={setPrompt}
            onNegative={setNegativePrompt}
            negativeDisabled={cfg <= 1}
          />
        }
        actions={
          <div className="flex w-80 shrink-0 flex-col gap-2 self-stretch">
            <button
              type="button"
              className="flex-1 rounded bg-generate px-6 text-xl font-semibold text-ink disabled:opacity-40"
              disabled={busy || !canGenerate}
              onClick={() => void generate()}
            >
              Generate
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded bg-muted px-3 py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
                disabled={!busy}
                title="Skip current image"
                onClick={() => void interrupt('skip')}
              >
                Interrupt
              </button>
              <button
                type="button"
                className="flex-1 rounded bg-red px-3 py-2.5 text-sm font-semibold text-ink hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
                disabled={!busy}
                title="Cancel remaining jobs"
                onClick={() => void interrupt('cancel')}
              >
                Cancel
              </button>
            </div>
          </div>
        }
      />

      <GenerateTabs
        shownTab={shownTab}
        visibleTabs={visibleTabs}
        onTab={setTab}
        swapTab={tabForSwap(swapTarget)}
        swapTarget={swapTarget}
        onSwapTarget={setSwapTarget}
        genRowRef={genRowRef}
        paramsWidth={paramsWidth}
        onParamsWidth={setParamsWidth}
        error={error}
        warning={warning}
        comfyOk={comfyOk}
        lastSeed={
          [...(job?.gallery ?? [])]
            .reverse()
            .find((item) => typeof item.seed === 'number')?.seed ??
          (typeof payload.seed === 'number' ? payload.seed : null)
        }
        onPromptMatrix={setPromptMatrix}
        starting={starting}
        imageIds={imageIds}
        jobId={jobId}
        job={job}
        busy={busy}
        progressPct={progressPct}
        currentLabel={currentLabel}
        jobPct={jobPct}
        overallLabel={overallLabel}
        timing={timing}
        baseKind={baseKind}
        baseItems={baseItems}
        baseValue={baseValue}
        onCheckpoint={setCheckpoint}
        onVae={setVae}
        onTextEncoder={setTextEncoder}
        prompt={prompt}
        negativePrompt={negativePrompt}
        loraItems={loraItems}
        activeLoraOrder={activeLoraOrder}
        loraAutoApplyDefault={loraAutoApplyDefault}
        wildcardItems={wildcardItems}
        onPrompt={setPrompt}
        onNegativePrompt={setNegativePrompt}
        onToggleAutoLora={toggleAutoLora}
      />
    </div>
  )
}
