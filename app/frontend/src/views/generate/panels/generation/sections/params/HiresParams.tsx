import { getKSamplerChoices } from '@/lib/api.ts'
import { DEFAULT_HIRES, useGenerateStore, type HiresSettings } from '@/stores/generateStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { SAMPLERS, SCHEDULERS } from '@/views/generate/panels/generation/sections/params/resolutions.ts'
import { HiresExtrasBody } from '@/views/generate/panels/generation/sections/params/HiresExtrasBody.tsx'
import { useEffect, useState } from 'react'

export function HiresParams({
  value,
  onChange,
  locked = false,
  comfyOk = false,
  width: widthProp,
  height: heightProp,
  lastSeed = null,
}: {
  value?: HiresSettings
  onChange?: (next: HiresSettings) => void
  locked?: boolean
  comfyOk?: boolean
  width?: number
  height?: number
  lastSeed?: number | null
}) {
  const storeHires = useGenerateStore((s) => s.hires)
  const storeWidth = useGenerateStore((s) => s.width)
  const storeHeight = useGenerateStore((s) => s.height)
  const setHires = useGenerateStore((s) => s.setHires)
  const hires = { ...DEFAULT_HIRES, ...(value ?? storeHires) }
  const hiddenSamplers = useSettingsStore((s) => s.hiddenSamplers)
  const hiddenSchedulers = useSettingsStore((s) => s.hiddenSchedulers)
  const setResolutions = useSettingsStore((s) => s.setResolutions)
  const [samplers, setSamplers] = useState<string[]>([...SAMPLERS])
  const [schedulers, setSchedulers] = useState<string[]>([...SCHEDULERS])

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
      onChange(merged)
      return
    }
    setHires(next)
  }

  return (
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
  )
}
