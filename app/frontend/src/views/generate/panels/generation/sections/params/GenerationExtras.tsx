import { ExpandSection } from '@/components/controls/expand-section/ExpandSection.tsx'
import { getKSamplerChoices } from '@/lib/api.ts'
import {
  DEFAULT_HIRES,
  useGenerateStore,
  type ExtraSettings,
  type HiresSettings,
} from '@/stores/generateStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { SAMPLERS, SCHEDULERS } from '@/views/generate/panels/generation/sections/params/resolutions.ts'
import { HiresExtrasBody } from '@/views/generate/panels/generation/sections/params/HiresExtrasBody.tsx'
import { useEffect, useState } from 'react'

type ExtraValue = {
  hires: HiresSettings
  adetailer: ExtraSettings
  controlnet: ExtraSettings
}

const KEYS = ['hires', 'adetailer', 'controlnet'] as const

const TITLES: Record<(typeof KEYS)[number], string> = {
  hires: 'Hires. fix',
  adetailer: 'ADetailer',
  controlnet: 'ControlNet',
}

export function GenerationExtras({
  value,
  onChange,
  locked = false,
  only,
  workflowParams,
  comfyOk = false,
  width: widthProp,
  height: heightProp,
  lastSeed = null,
}: {
  value?: ExtraValue
  onChange?: (patch: Partial<ExtraValue>) => void
  locked?: boolean
  only?: keyof ExtraValue
  workflowParams?: string[]
  comfyOk?: boolean
  width?: number
  height?: number
  lastSeed?: number | null
}) {
  const storeHires = useGenerateStore((s) => s.hires)
  const storeAdetailer = useGenerateStore((s) => s.adetailer)
  const storeControlnet = useGenerateStore((s) => s.controlnet)
  const storeWidth = useGenerateStore((s) => s.width)
  const storeHeight = useGenerateStore((s) => s.height)
  const setHires = useGenerateStore((s) => s.setHires)
  const setAdetailer = useGenerateStore((s) => s.setAdetailer)
  const setControlnet = useGenerateStore((s) => s.setControlnet)
  const hires = { ...DEFAULT_HIRES, ...(value?.hires ?? storeHires) }
  const adetailer = value?.adetailer ?? storeAdetailer
  const controlnet = value?.controlnet ?? storeControlnet
  const extras = { hires, adetailer, controlnet }
  const [expanded, setExpanded] = useState({
    hires: hires.enabled,
    adetailer: adetailer.enabled,
    controlnet: controlnet.enabled,
  })
  const hiddenSamplers = useSettingsStore((s) => s.hiddenSamplers)
  const hiddenSchedulers = useSettingsStore((s) => s.hiddenSchedulers)
  const setResolutions = useSettingsStore((s) => s.setResolutions)
  const [samplers, setSamplers] = useState<string[]>([...SAMPLERS])
  const [schedulers, setSchedulers] = useState<string[]>([...SCHEDULERS])

  useEffect(() => {
    setExpanded((current) => ({ ...current, hires: hires.enabled }))
  }, [hires.enabled])
  useEffect(() => {
    setExpanded((current) => ({ ...current, adetailer: adetailer.enabled }))
  }, [adetailer.enabled])
  useEffect(() => {
    setExpanded((current) => ({ ...current, controlnet: controlnet.enabled }))
  }, [controlnet.enabled])

  useEffect(() => {
    if (!comfyOk) {
      return
    }
    void getKSamplerChoices()
      .then((data) => {
        if (data.samplers.length) {
          setSamplers(data.samplers)
        }
        if (data.schedulers.length) {
          setSchedulers(data.schedulers)
        }
      })
      .catch(() => {})
  }, [comfyOk])

  function patchHires(next: Partial<HiresSettings>) {
    if (locked) {
      return
    }
    const merged = { ...hires, ...next }
    if (onChange) {
      onChange({ hires: merged })
      return
    }
    setHires(next)
  }

  function patchEnabled(key: (typeof KEYS)[number], enabled: boolean) {
    if (locked) {
      return
    }
    if (key === 'hires') {
      patchHires({ enabled })
      return
    }
    const current = extras[key]
    const next = { ...current, enabled }
    if (onChange) {
      onChange({ [key]: next } as Partial<ExtraValue>)
      return
    }
    if (key === 'adetailer') {
      setAdetailer({ enabled })
      return
    }
    setControlnet({ enabled })
  }

  function section(key: (typeof KEYS)[number]) {
    const extra = extras[key]
    return (
      <ExpandSection
        title={TITLES[key]}
        enabled={extra.enabled}
        onEnabled={(enabled) => patchEnabled(key, enabled)}
        open={expanded[key]}
        onOpenChange={(open) => setExpanded((current) => ({ ...current, [key]: open }))}
        locked={locked}
        fit
      >
        {key === 'hires' ? (
          <HiresExtrasBody
            hires={hires}
            patchHires={patchHires}
            locked={locked}
            width={widthProp ?? storeWidth}
            height={heightProp ?? storeHeight}
            lastSeed={lastSeed}
            samplers={samplers}
            schedulers={schedulers}
            hiddenSamplers={hiddenSamplers}
            hiddenSchedulers={hiddenSchedulers}
            setResolutions={setResolutions}
          />
        ) : (
          <p className="text-sm text-muted">{TITLES[key]} settings will go here.</p>
        )}
      </ExpandSection>
    )
  }

  const shown = KEYS.filter((key) => {
    if (only && key !== only) {
      return false
    }
    if (key === 'hires' && workflowParams && !workflowParams.includes('hires')) {
      return false
    }
    return true
  })
  if (!shown.length) {
    return null
  }
  if (only) {
    return section(only)
  }
  const lifted = shown.filter((key) => expanded[key])
  const row = shown.filter((key) => !expanded[key])
  return (
    <div className="flex flex-col gap-stack">
      {lifted.map((key) => (
        <div key={key} className="w-full">
          {section(key)}
        </div>
      ))}
      {row.length ? (
        <div className="flex gap-stack">
          {row.map((key) => (
            <div key={key} className="min-w-0 flex-1">
              {section(key)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
