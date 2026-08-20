import { GalleryView } from '@/components/GalleryView.tsx'
import { PaneSplitter } from '@/components/PaneSplitter.tsx'
import { ImageStage } from './ImageStage.tsx'
import { GenerationParams } from './GenerationParams.tsx'
import { GenerateModels } from './GenerateModels.tsx'
import { PromptStack } from './PromptStack.tsx'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  createJob,
  getJob,
  getLatestJob,
  interruptJob,
  jobPreviewUrl,
  jobGridUrl,
  type Job,
} from '@/lib/api.ts'
import { loraNameMatches, parseLoraHits, toggleLoraPrompts } from '@/lib/loraTags.ts'
import { parseWildcardTags, toggleWildcard, wildcardMatches } from '@/lib/wildcardTags.ts'
import { digitKey, overlayOpen } from '@/lib/hotkeys.ts'
import { nextSeed, usedSeed, useGenerateStore } from '@/stores/generateStore.ts'
import { useHealthStore } from '@/stores/healthStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { toast } from '@/stores/toastStore.ts'
import { GENERATE_TABS, orderedGenerateTabs, type GenerateTab } from './tabs.ts'

function idsFromJob(job: Job): string[] {
  return job.gallery_ids
}

function selectedLoraPaths(prompt: string, items: { path: string }[]) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const hit of parseLoraHits(prompt)) {
    const item = items.find((row) => loraNameMatches(hit.name, row.path))
    if (item && !seen.has(item.path)) {
      seen.add(item.path)
      out.push(item.path)
    }
  }
  return out
}

function selectedWildcardPaths(prompt: string, items: { path: string }[]) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const hit of parseWildcardTags(prompt)) {
    const item = items.find((row) => wildcardMatches(row, hit.name))
    if (item && !seen.has(item.path)) {
      seen.add(item.path)
      out.push(item.path)
    }
  }
  return out
}

function etaSeconds(startedAt: string | null, value: number, max: number): number | null {
  if (!startedAt || value <= 0 || max <= 0) {
    return null
  }
  const elapsed = (Date.now() - Date.parse(startedAt)) / 1000
  if (!Number.isFinite(elapsed) || elapsed < 0.5) {
    return null
  }
  return Math.max(0, Math.round((elapsed * (max - value)) / value))
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds * 10) / 10}s`
  }
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function jobSeconds(job: Job): number | null {
  if (job.status !== 'completed') {
    return null
  }
  const ms = Number(job.payload.duration_ms)
  if (Number.isFinite(ms) && ms >= 0) {
    return ms / 1000
  }
  if (job.started_at && job.finished_at) {
    const elapsed = (Date.parse(job.finished_at) - Date.parse(job.started_at)) / 1000
    if (Number.isFinite(elapsed) && elapsed >= 0) {
      return elapsed
    }
  }
  return null
}

const PARAMS_RATIO = 0.5
const PARAMS_MIN_REM = 18
const PARAMS_MAX_RATIO = 0.75

function remPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
}

function defaultParamsWidth(row: HTMLElement | null) {
  return row && row.clientWidth > 0 ? row.clientWidth * PARAMS_RATIO : PARAMS_MIN_REM * remPx()
}

function progressLabel(pct: number, eta: number | null): string {
  if (pct <= 0) {
    return 'Starting…'
  }
  if (eta == null) {
    return `${Math.round(pct)}%`
  }
  return `${Math.round(pct)}% ETA: ${eta}s`
}

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
  const setPrompt = useGenerateStore((s) => s.setPrompt)
  const setNegativePrompt = useGenerateStore((s) => s.setNegativePrompt)
  const setCheckpoint = useGenerateStore((s) => s.setCheckpoint)
  const batchGrid = useSettingsStore((s) => s.batchGrid)
  const batchGridMax = useSettingsStore((s) => s.batchGridMax)
  const batchGridQuality = useSettingsStore((s) => s.batchGridQuality)
  const batchGridRows = useSettingsStore((s) => s.batchGridRows)
  const batchGridFill = useSettingsStore((s) => s.batchGridFill)
  const batchGridOnCancel = useSettingsStore((s) => s.batchGridOnCancel)
  const saveInterrupted = useSettingsStore((s) => s.saveInterrupted)
  const interruptedInGrid = useSettingsStore((s) => s.interruptedInGrid)
  const hiddenGenerateTabs = useSettingsStore((s) => s.hiddenGenerateTabs)
  const generateTabOrder = useSettingsStore((s) => s.generateTabOrder)
  const generateTabKeysFollowLayout = useSettingsStore((s) => s.generateTabKeysFollowLayout)
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const loraItems = useModelsStore((s) => s.loras)
  const wildcardItems = useModelsStore((s) => s.wildcards)

  const health = useHealthStore((s) => s.health)

  const [job, setJob] = useState<Job | null>(null)
  const [imageIds, setImageIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<GenerateTab>('Generation')
  const [starting, setStarting] = useState(false)
  const genRowRef = useRef<HTMLDivElement>(null)
  const runLock = useRef(false)
  const [paramsWidth, setParamsWidth] = useState<number | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const incoming = location.state as { tab?: GenerateTab } | null
    if (incoming?.tab && GENERATE_TABS.includes(incoming.tab)) {
      setTab(incoming.tab)
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
    setSeed(nextSeed(used, seedAfter, count))
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
        batch_grid: batchGrid,
        batch_grid_max: batchGridMax,
        batch_grid_quality: batchGridQuality,
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
  }, [busy, checkpoint, generate, generateTabKeysFollowLayout, generateTabOrder, health, hiddenGenerateTabs, interrupt, navigate, restart])

  const comfyOk = health?.comfy.reachable === true
  const canGenerate = comfyOk && Boolean(checkpoint.trim())
  const payload = job?.payload ?? {}
  const missingLoras = Array.isArray(payload.lora_missing)
    ? payload.lora_missing.filter((item): item is string => typeof item === 'string' && Boolean(item))
    : []
  const loraWarning = missingLoras.length ? `Missing LoRA: ${missingLoras.join(', ')}` : null
  const warning = loraWarning
  const batchTotal =
    Math.max(1, Number(payload.batch_size) || 1) * Math.max(1, Number(payload.batch_count) || 1)
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

      <div
        className={['flex min-w-0 flex-col', shownTab !== 'Generation' ? 'flex-1' : ''].join(' ')}
      >
        <div className="flex shrink-0 gap-1 px-2">
          {visibleTabs.map((item) => (
            <button
              key={item}
              type="button"
              className={[
                '-mb-px rounded-t-md border px-3 py-1.5 text-sm',
                shownTab === item
                  ? 'border-line border-b-panel bg-panel text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              ].join(' ')}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div
          className={[
            'mb-4 rounded-b-md rounded-tr-md border border-line bg-panel p-3',
            shownTab !== 'Generation' ? 'flex flex-1 flex-col' : '',
          ].join(' ')}
        >
          <div ref={genRowRef} className={shownTab === 'Generation' ? 'flex min-w-0' : 'hidden'}>
            <div className="min-w-0 shrink-0" style={{ width: paramsWidth ?? `${PARAMS_RATIO * 100}%` }}>
              <GenerationParams
                error={error}
                warning={warning}
                comfyOk={comfyOk}
                lastSeed={
                  [...(job?.gallery ?? [])]
                    .reverse()
                    .find((item) => typeof item.seed === 'number')?.seed ??
                  (typeof payload.seed === 'number' ? payload.seed : null)
                }
              />
            </div>
            <PaneSplitter
              value={paramsWidth ?? defaultParamsWidth(genRowRef.current)}
              onChange={setParamsWidth}
              onReset={() => setParamsWidth(null)}
              min={PARAMS_MIN_REM * remPx()}
              containerRef={genRowRef}
              maxRatio={PARAMS_MAX_RATIO}
            />
            <ImageStage
              images={starting ? [] : imageIds}
              gridUrls={
                !starting && jobId && (job?.grid_count || (job?.has_grid ? 1 : 0))
                  ? Array.from({ length: job.grid_count || 1 }, (_, i) => jobGridUrl(jobId, i))
                  : []
              }
              gallery={starting ? [] : (job?.gallery ?? [])}
              busy={busy}
              previewUrl={!starting && busy && job?.has_preview && jobId ? jobPreviewUrl(jobId, progressValue) : null}
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
                kind="checkpoints"
                items={checkpoints}
                value={checkpoint}
                onSelect={setCheckpoint}
              />
            </div>
          ) : null}
          {shownTab === 'Lora' ? (
            <div className="flex-1">
              <GalleryView
                kind="loras"
                items={loraItems}
                selected={selectedLoraPaths(prompt, loraItems)}
                onSelect={(path) => {
                  const item = loraItems.find((row) => row.path === path)
                  const next = toggleLoraPrompts(prompt, negativePrompt, path, item?.prompt || '', '', item?.strength ?? 1)
                  setPrompt(next.prompt)
                  setNegativePrompt(next.negativePrompt)
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
                onSelect={(path) => {
                  const item = wildcardItems.find((row) => row.path === path)
                  if (item) {
                    setPrompt(toggleWildcard(prompt, item))
                  }
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
