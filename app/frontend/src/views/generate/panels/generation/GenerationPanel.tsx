import { PaneSplitter } from '@/components/controls/resizable-panel/PaneSplitter.tsx'
import { GenerationParams } from '@/views/generate/panels/generation/sections/params/GenerationParams.tsx'
import { ImageStage } from '@/views/generate/panels/generation/sections/stage/ImageStage.tsx'
import { defaultParamsWidth, PARAMS_MAX_RATIO, PARAMS_MIN_REM, PARAMS_RATIO, remPx } from '@/views/generate/panels/generation/generateHelpers.ts'
import { jobGridUrl, jobPreviewUrl, type Job } from '@/lib/api.ts'
import type { ReactNode, RefObject } from 'react'

export function GenerationPanel({
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
  hidden,
  actions,
}: {
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
  hidden: boolean
  actions?: ReactNode
}) {
  const stage = (
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
      progressSegments={progressSegments}
      jobProgressPct={jobPct}
      jobProgressLabel={overallLabel}
      timing={timing}
      hideInfo={workflowParams.includes('rembg')}
    />
  )
  return (
    <div ref={genRowRef} className={hidden ? 'hidden' : 'flex min-w-0'}>
      <div className="min-w-0 shrink-0" style={{ width: paramsWidth ?? `${PARAMS_RATIO * 100}%` }}>
        <GenerationParams
          warning={warning}
          comfyOk={comfyOk}
          lastSeed={lastSeed}
          workflowParams={workflowParams}
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
      {actions ? <div className="flex min-w-0 flex-1 flex-col gap-stack">{actions}{stage}</div> : stage}
    </div>
  )
}
