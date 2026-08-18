import { CheckpointField } from '@/components/CheckpointField.tsx'
import { ImageStage } from './ImageStage.tsx'
import { GenerationParams } from './GenerationParams.tsx'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
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

function fieldClass() {
  return 'w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'
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
  const hiddenGenerateTabs = useSettingsStore((s) => s.hiddenGenerateTabs) ?? []

  const health = useHealthStore((s) => s.health)

  const [job, setJob] = useState<Job | null>(null)
  const [imageIds, setImageIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<GenerateTab>('Generation')
  const interruptAt = useRef(0)
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
    <div className="flex h-full flex-col gap-3" onKeyDown={onKeyDown}>
      <CheckpointField value={checkpoint} onChange={setCheckpoint} refresh />
      <div className="flex h-[26%] min-h-40 shrink-0 items-stretch gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <textarea
            className={`${fieldClass()} min-h-0 flex-[3] resize-y font-mono`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Positive"
            spellCheck={false}
          />
          <textarea
            className={`${fieldClass()} min-h-0 flex-1 resize-y font-mono disabled:cursor-not-allowed`}
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="Negative"
            spellCheck={false}
            disabled={cfg <= 1}
          />
        </div>
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

      <div className="flex min-w-0 flex-col">
        <div className="flex gap-1 px-2">
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
        <div className="rounded-b-md rounded-tr-md border border-line bg-panel p-3">
          <div className={shownTab === 'Generation' ? 'flex gap-4' : 'hidden'}>
            <GenerationParams
              error={error}
              comfyOk={comfyOk}
              lastSeed={typeof payload.seed === 'number' ? payload.seed : null}
            />
            <ImageStage
              key={jobId || 'empty'}
              images={imageIds}
              gridUrl={job?.has_grid && jobId ? jobGridUrl(jobId) : null}
              busy={busy}
              previewUrl={busy && job?.has_preview && jobId ? jobPreviewUrl(jobId, progressValue) : null}
              progressPct={progressPct}
              progressLabel={currentLabel}
              jobProgressPct={jobPct}
              jobProgressLabel={overallLabel}
              timing={timing}
            />
          </div>
          {shownTab !== 'Generation' ? <p className="text-sm text-muted">Stub.</p> : null}
        </div>
      </div>
    </div>
  )
}
