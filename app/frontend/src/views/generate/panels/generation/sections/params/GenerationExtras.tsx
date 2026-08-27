import { ExpandSection } from '@/components/controls/expand-section/ExpandSection.tsx'
import { useGenerateStore, type ExtraSettings } from '@/stores/generateStore.ts'
import { useEffect, useState } from 'react'

type ExtraValue = {
  hires: ExtraSettings
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
}: {
  value?: ExtraValue
  onChange?: (patch: Partial<ExtraValue>) => void
  locked?: boolean
  only?: keyof ExtraValue
}) {
  const storeHires = useGenerateStore((s) => s.hires)
  const storeAdetailer = useGenerateStore((s) => s.adetailer)
  const storeControlnet = useGenerateStore((s) => s.controlnet)
  const setHires = useGenerateStore((s) => s.setHires)
  const setAdetailer = useGenerateStore((s) => s.setAdetailer)
  const setControlnet = useGenerateStore((s) => s.setControlnet)
  const hires = value?.hires ?? storeHires
  const adetailer = value?.adetailer ?? storeAdetailer
  const controlnet = value?.controlnet ?? storeControlnet
  const extras = { hires, adetailer, controlnet }
  const [expanded, setExpanded] = useState({
    hires: hires.enabled,
    adetailer: adetailer.enabled,
    controlnet: controlnet.enabled,
  })

  useEffect(() => {
    setExpanded((current) => ({ ...current, hires: hires.enabled }))
  }, [hires.enabled])
  useEffect(() => {
    setExpanded((current) => ({ ...current, adetailer: adetailer.enabled }))
  }, [adetailer.enabled])
  useEffect(() => {
    setExpanded((current) => ({ ...current, controlnet: controlnet.enabled }))
  }, [controlnet.enabled])

  function patch<K extends keyof ExtraValue>(key: K, enabled: boolean) {
    if (locked) {
      return
    }
    const current = extras[key]
    const next = { ...current, enabled }
    if (onChange) {
      onChange({ [key]: next } as Partial<ExtraValue>)
      return
    }
    if (key === 'hires') {
      setHires({ enabled })
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
        onEnabled={(enabled) => patch(key, enabled)}
        open={expanded[key]}
        onOpenChange={(open) => setExpanded((current) => ({ ...current, [key]: open }))}
        fit
      >
        <p className="text-sm text-muted">{TITLES[key]} settings will go here.</p>
      </ExpandSection>
    )
  }

  const shown = KEYS.filter((key) => !only || only === key)
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
