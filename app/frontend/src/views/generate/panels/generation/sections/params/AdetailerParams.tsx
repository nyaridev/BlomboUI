import { getKSamplerChoices } from '@/lib/api.ts'
import {
  DEFAULT_ADETAILER,
  useGenerateStore,
  type AdetailerSettings,
  type AdetailerUnit,
} from '@/stores/generateStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { AdetailerUnitBody } from '@/views/generate/panels/generation/sections/params/AdetailerUnitBody.tsx'
import { AdetailerUnitTabs } from '@/views/generate/panels/generation/sections/params/AdetailerUnitTabs.tsx'
import { SAMPLERS, SCHEDULERS } from '@/views/generate/panels/generation/sections/params/resolutions.ts'
import { useEffect, useState } from 'react'

export function AdetailerParams({
  value,
  onChange,
  locked = false,
  comfyOk = false,
  lastSeed = null,
}: {
  value?: AdetailerSettings
  onChange?: (next: AdetailerSettings) => void
  locked?: boolean
  comfyOk?: boolean
  lastSeed?: number | null
}) {
  const store = useGenerateStore((s) => s.adetailer)
  const setAdetailer = useGenerateStore((s) => s.setAdetailer)
  const adetailer = value ?? store
  const units = adetailer.units?.length ? adetailer.units : DEFAULT_ADETAILER.units
  const [active, setActive] = useState(units[0]?.id || '')
  const hiddenSamplers = useSettingsStore((s) => s.hiddenSamplers)
  const hiddenSchedulers = useSettingsStore((s) => s.hiddenSchedulers)
  const [samplers, setSamplers] = useState<string[]>([...SAMPLERS])
  const [schedulers, setSchedulers] = useState<string[]>([...SCHEDULERS])
  const unit = units.find((item) => item.id === active) || units[0]

  useEffect(() => {
    if (!units.some((item) => item.id === active) && units[0]) {
      setActive(units[0].id)
    }
  }, [active, units])

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

  function commit(next: AdetailerSettings) {
    if (locked) {
      return
    }
    if (onChange) {
      onChange(next)
      return
    }
    setAdetailer(next)
  }

  function patchUnit(id: string, part: Partial<AdetailerUnit>) {
    commit({
      ...adetailer,
      units: units.map((item) => (item.id === id ? { ...item, ...part } : item)),
    })
  }

  if (!unit) {
    return null
  }

  return (
    <div className="flex min-w-0 flex-col gap-stack">
      <AdetailerUnitTabs
        units={units}
        active={unit.id}
        onActive={setActive}
        onChange={(next) => commit({ ...adetailer, units: next })}
        locked={locked}
      />
      <div className={unit.enabled === false ? 'pointer-events-none opacity-50' : ''}>
        <AdetailerUnitBody
          key={unit.id}
          unit={unit}
          patch={(part) => patchUnit(unit.id, part)}
          locked={locked}
          lastSeed={lastSeed}
          samplers={samplers}
          schedulers={schedulers}
          hiddenSamplers={hiddenSamplers}
          hiddenSchedulers={hiddenSchedulers}
        />
      </div>
    </div>
  )
}
