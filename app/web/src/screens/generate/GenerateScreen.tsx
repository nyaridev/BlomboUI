import { CheckpointField } from '@/components/CheckpointField.tsx'
import { GalleryView } from '@/components/GalleryView.tsx'
import { PaneSplitter } from '@/components/PaneSplitter.tsx'
import { ImageStage } from './ImageStage.tsx'
import { GenerationParams } from './GenerationParams.tsx'
import { PromptStack } from './PromptStack.tsx'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import {
  createJob,
  getJob,
  getLatestJob,
  interruptJob,
  jobPreviewUrl,
  jobGridUrl,
  type Job,
} from '@/lib/api.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useHealthStore } from '@/stores/healthStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { GENERATE_TABS, type GenerateTab } from './tabs.ts'

function idsFromJob(job: Job): string[] {
  if (job.generation_ids?.length) {
    return job.generation_ids
  }
  if (job.generation_id) {
    return [job.generation_id]
  }
  return []
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
  const batchSize = useGenerateStore((s) => s.batchSize)
  const batchCount = useGenerateStore((s) => s.batchCount)
  const sampler = useGenerateStore((s) => s.sampler)
  const scheduler = useGenerateStore((s) => s.scheduler)
  const workflow = useGenerateStore((s) => s.workflow)
  const setPrompt = useGenerateStore((s) => s.setPrompt)
  const setNegativePrompt = useGenerateStore((s) => s.setNegativePrompt)
  const setCheckpoint = useGenerateStore((s) => s.setCheckpoint)
  const batchGrid = useSettingsStore((s) => s.batchGrid)
  const batchGridMax = useSettingsStore((s) => s.batchGridMax)
  const batchGridQuality = useSettingsStore((s) => s.batchGridQuality)
  const batchGridRows = useSettingsStore((s) => s.batchGridRows)
  const batchGridFill = useSettingsStore((s) => s.batchGridFill)
  const hiddenGenerateTabs = useSettingsStore((s) => s.hiddenGenerateTabs) ?? []
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const loras = useModelsStore((s) => s.loras)

  const health = useHealthStore((s) => s.health)

  const [job, setJob] = useState<Job | null>(null)
  const [imageIds, setImageIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<GenerateTab>('Generation')
  const interruptAt = useRef(0)
  const genRowRef = useRef<HTMLDivElement>(null)
  const [paramsWidth, setParamsWidth] = useState<number | null>(null)
  const location = useLocation()

  useEffect(() => {
    const incoming = location.state as { tab?: GenerateTab } | null
    if (incoming?.tab && GENERATE_TABS.includes(incoming.tab)) {
      setTab(incoming.tab)
    }
  }, [location.key])
  const busy = job?.status === 'queued' || job?.status === 'running'
  const jobId = job?.id

  useEffect(() => {
    void getLatestJob().then((latest) => {
      if (latest) {
        setJob(latest)
        setImageIds(idsFromJob(latest))
      }
    })
  }, [])

  useEffect(() => {
    if (!jobId) {
      return
    }
    if (!busy) {
      void getJob(jobId).then((next) => {
        setJob(next)
        setImageIds(idsFromJob(next))
      })
      return
    }
    const timer = window.setInterval(() => {
      void getJob(jobId).then((next) => {
        setJob(next)
        setImageIds(idsFromJob(next))
        if (next.status === 'failed') {
          setError(next.error || 'Generate failed')
        }
      })
    }, 500)
    return () => window.clearInterval(timer)
  }, [jobId, busy])

  async function generate() {
    setError(null)
    try {
      const next = await createJob({
        prompt,
        negative_prompt: negativePrompt,
        checkpoint,
        width,
        height,
        steps,
        cfg: Math.max(1, cfg),
        seed,
        batch_size: Math.max(1, Math.min(8, Math.round(Number(batchSize)) || 1)),
        batch_count: Math.max(1, Math.min(100, Math.round(Number(batchCount)) || 1)),
        batch_grid: batchGrid,
        batch_grid_max: batchGridMax,
        batch_grid_quality: batchGridQuality,
        batch_grid_rows: batchGridRows,
        batch_grid_fill: batchGridFill,
        sampler,
        scheduler,
        workflow,
      })
      setJob(next)
      setImageIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generate failed')
    }
  }

  async function onGenerateClick() {
    const now = Date.now()
    if (busy && jobId) {
      const mode = now - interruptAt.current < 400 ? 'cancel' : 'skip'
      interruptAt.current = now
      try {
        const next = await interruptJob(jobId, mode)
        setJob(next)
        setImageIds(idsFromJob(next))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Interrupt failed')
      }
      return
    }
    if (now - interruptAt.current < 400) {
      return
    }
    void generate()
  }

  function onKeyDown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      if (!busy) {
        void generate()
      }
    }
  }

  const comfyOk = health?.comfy.reachable === true
  const payload = job?.payload ?? {}
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
  const visibleTabs = GENERATE_TABS.filter(
    (item) => item === 'Generation' || !hiddenGenerateTabs.includes(item),
  )
  const shownTab = visibleTabs.includes(tab) ? tab : (visibleTabs[0] ?? 'Generation')

  return (
    <div
      data-generate-root
      className={[
        'flex h-full flex-col gap-3',
        shownTab === 'Generation' ? 'min-h-full' : 'min-h-0 overflow-hidden',
      ].join(' ')}
      onKeyDown={onKeyDown}
    >
      <CheckpointField value={checkpoint} onChange={setCheckpoint} refresh />
      <div className="flex shrink-0 items-stretch gap-3">
        <PromptStack
          prompt={prompt}
          negativePrompt={negativePrompt}
          onPrompt={setPrompt}
          onNegative={setNegativePrompt}
          negativeDisabled={cfg <= 1}
        />
        <button
          type="button"
          className={[
            'w-80 shrink-0 self-stretch rounded px-6 text-xl font-semibold text-ink disabled:opacity-40',
            busy ? 'bg-muted' : 'bg-generate',
          ].join(' ')}
          disabled={!busy && !comfyOk}
          title={busy ? 'Skip current batch. Double-click to cancel.' : undefined}
          onClick={() => void onGenerateClick()}
        >
          {busy ? 'Interrupt' : 'Generate'}
        </button>
      </div>

      <div
        className={['flex min-w-0 flex-col', shownTab !== 'Generation' ? 'min-h-0 flex-1' : ''].join(' ')}
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
            shownTab !== 'Generation' ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : '',
          ].join(' ')}
        >
          <div ref={genRowRef} className={shownTab === 'Generation' ? 'flex min-w-0' : 'hidden'}>
            <div className="min-w-0 shrink-0" style={{ width: paramsWidth ?? `${PARAMS_RATIO * 100}%` }}>
              <GenerationParams
                error={error}
                comfyOk={comfyOk}
                lastSeed={typeof payload.seed === 'number' ? payload.seed : null}
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
              key={jobId || 'empty'}
              images={imageIds}
              gridUrls={
                jobId && (job?.grid_count || (job?.has_grid ? 1 : 0))
                  ? Array.from({ length: job.grid_count || 1 }, (_, i) => jobGridUrl(jobId, i))
                  : []
              }
              busy={busy}
              previewUrl={busy && job?.has_preview && jobId ? jobPreviewUrl(jobId, progressValue) : null}
              progressPct={progressPct}
              progressLabel={currentLabel}
              jobProgressPct={jobPct}
              jobProgressLabel={overallLabel}
              timing={timing}
            />
          </div>
          <div className={shownTab === 'Base Model' ? 'h-full min-h-0 flex-1' : 'hidden'}>
            <GalleryView
              kind="checkpoints"
              items={checkpoints}
              value={checkpoint}
              onSelect={setCheckpoint}
            />
          </div>
          <div className={shownTab === 'Lora' ? 'h-full min-h-0 flex-1' : 'hidden'}>
            <GalleryView kind="loras" items={loras} />
          </div>
          {shownTab !== 'Generation' && shownTab !== 'Base Model' && shownTab !== 'Lora' ? (
            <p className="text-sm text-muted">Stub.</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
