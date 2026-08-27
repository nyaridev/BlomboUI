import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { IconButton } from '@/components/controls/button/IconButton.tsx'
import { same } from '@/stores/settings/clean.ts'
import { settingCurrent, settingDefault, type SettingsKey } from '@/stores/settings/reset.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import type { ReactNode } from 'react'

export function SettingsReset({ setting, field }: { setting: SettingsKey; field?: string }) {
  const dirty = useSettingsStore((state) => !same(settingCurrent(state, setting, field), settingDefault(setting, field)))
  if (!dirty) {
    return null
  }
  return (
    <IconButton
      type="button"
      tone="ghost"
      className="shrink-0"
      aria-label="Reset to default"
      title="Reset to default"
      onClick={() => useSettingsStore.getState().resetSetting(setting, field)}
    >
      <AppIcon id="undo-2" size={14} />
    </IconButton>
  )
}

export function SettingsField({
  setting,
  field,
  className = 'flex items-center gap-2',
  children,
}: {
  setting: SettingsKey
  field?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <div className="min-w-0 flex-1">{children}</div>
      <SettingsReset setting={setting} field={field} />
    </div>
  )
}
