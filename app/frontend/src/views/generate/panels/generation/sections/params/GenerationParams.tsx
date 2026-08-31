import { AdetailerParams } from '@/views/generate/panels/generation/sections/params/AdetailerParams.tsx'
import { ImageUpscaleParams } from '@/views/generate/panels/generation/sections/params/ImageUpscaleParams.tsx'
import { RembgParams } from '@/views/generate/panels/generation/sections/params/RembgParams.tsx'
import { CaptionParams } from '@/views/generate/panels/generation/sections/params/CaptionParams.tsx'
import { ControlnetParams } from '@/views/generate/panels/generation/sections/params/ControlnetParams.tsx'
import { FirstPassParams } from '@/views/generate/panels/generation/sections/params/FirstPassParams.tsx'
import { HiresParams } from '@/views/generate/panels/generation/sections/params/HiresParams.tsx'
import { ParamsTabStrip, type PassTab } from '@/views/generate/panels/generation/sections/params/ParamsTabStrip.tsx'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useState } from 'react'

type GenerationParamsProps = {
  warning?: string | null
  comfyOk: boolean
  lastSeed: number | null
  workflowParams: string[]
}

export function GenerationParams({
  warning,
  comfyOk,
  lastSeed,
  workflowParams,
}: GenerationParamsProps) {
  const hires = useGenerateStore((s) => s.hires)
  const adetailer = useGenerateStore((s) => s.adetailer)
  const controlnet = useGenerateStore((s) => s.controlnet)
  const setHires = useGenerateStore((s) => s.setHires)
  const setAdetailer = useGenerateStore((s) => s.setAdetailer)
  const setControlnet = useGenerateStore((s) => s.setControlnet)
  const showHires = !workflowParams.length || workflowParams.includes('hires')
  const rembg = workflowParams.includes('rembg')
  const upscale = workflowParams.includes('upscale')
  const caption = workflowParams.includes('caption')
  const [pass, setPass] = useState<PassTab>('first')
  const shown = pass === 'hires' && !showHires ? 'first' : pass
  const enabled =
    shown === 'first' ||
    (shown === 'hires' && hires.enabled) ||
    (shown === 'adetailer' && adetailer.enabled) ||
    (shown === 'controlnet' && controlnet.enabled)

  return (
    <aside className="flex min-w-0 w-full flex-col gap-stack">
      {rembg ? (
        <RembgParams />
      ) : upscale ? (
        <ImageUpscaleParams lastSeed={lastSeed} />
      ) : caption ? (
        <CaptionParams />
      ) : (
        <>
      <ParamsTabStrip
        value={shown}
        onValueChange={setPass}
        showHires={showHires}
        hiresOn={hires.enabled}
        adetailerOn={adetailer.enabled}
        controlnetOn={controlnet.enabled}
        onHires={(next) => setHires({ enabled: next })}
        onAdetailer={(next) => setAdetailer({ enabled: next })}
        onControlnet={(next) => setControlnet({ enabled: next })}
      />
      <div className={['relative', enabled ? '' : 'pointer-events-none opacity-50'].filter(Boolean).join(' ')}>
        <div className={shown === 'first' ? '' : 'pointer-events-none invisible absolute inset-x-0 top-0'}>
          <FirstPassParams comfyOk={comfyOk} lastSeed={lastSeed} workflowParams={workflowParams} />
        </div>
        <div className={shown === 'controlnet' ? '' : 'pointer-events-none invisible absolute inset-x-0 top-0'}>
          <ControlnetParams />
        </div>
        {showHires ? (
          <div className={shown === 'hires' ? '' : 'pointer-events-none invisible absolute inset-x-0 top-0'}>
            <HiresParams comfyOk={comfyOk} lastSeed={lastSeed} />
          </div>
        ) : null}
        <div className={shown === 'adetailer' ? '' : 'pointer-events-none invisible absolute inset-x-0 top-0'}>
          <AdetailerParams comfyOk={comfyOk} lastSeed={lastSeed} />
        </div>
      </div>
        </>
      )}
      {warning ? <p className="text-xs text-muted">{warning}</p> : null}
    </aside>
  )
}
