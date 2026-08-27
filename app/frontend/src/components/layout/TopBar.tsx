import { tabTriggerClass } from '@/components/controls/tabs/TabsControl.tsx'
import { NavLink } from 'react-router-dom'
import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { ComfyStatus } from '@/components/layout/ComfyStatus.tsx'
import { GpuBar } from '@/components/layout/GpuBar.tsx'
import { TemplateBar } from '@/components/composites/templates/TemplateBar.tsx'
import { WorkflowPicker } from '@/components/composites/templates/WorkflowPicker.tsx'
import { mainTab } from '@/app/appTabs.ts'

const COUNT_BADGE =
  'inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 text-[10px] leading-none tabular-nums text-ink'

export function TopBar({
  leftTabs,
  showErrors,
  issueCount,
  comfyOk,
  comfyMissing,
}: {
  leftTabs: string[]
  showErrors: boolean
  issueCount: number
  comfyOk: boolean
  comfyMissing: boolean
}) {
  return (
    <header className="flex flex-col bg-panel px-4 pt-2">
      <div className="flex items-center gap-2 pb-2">
        <div className="flex items-center gap-1.5">
          <WorkflowPicker />
          <TemplateBar />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {!comfyOk ? (
            <p className="text-xs text-muted">
              {comfyMissing ? 'Run install\\install-comfyui.bat, then relaunch.' : 'ComfyUI backend is starting…'}
            </p>
          ) : (
            <GpuBar />
          )}
          <ComfyStatus />
        </div>
      </div>
      <nav className="flex gap-1 border-b border-line px-2">
        {leftTabs.map((id) => {
          const item = mainTab(id)
          if (!item) {
            return null
          }
          return (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => tabTriggerClass(isActive, '', 'page')}>
              {item.label}
            </NavLink>
          )
        })}
        <div className="ml-auto flex gap-1">
          {showErrors ? (
            <NavLink
              to="/errors"
              title="Errors"
              aria-label={issueCount > 0 ? `Errors, ${issueCount}` : 'Errors'}
              className={({ isActive }) => tabTriggerClass(isActive, 'flex items-center gap-1.5', 'page')}
            >
              <AppIcon id="triangle-alert" size={14} />
              {issueCount > 0 ? <span className={COUNT_BADGE}>{issueCount}</span> : null}
            </NavLink>
          ) : null}
          <NavLink to="/history" title="History" aria-label="History" className={({ isActive }) => tabTriggerClass(isActive, 'flex items-center', 'page')}>
            <AppIcon id="clock" size={14} />
          </NavLink>
          <NavLink to="/settings" title="Settings" aria-label="Settings" className={({ isActive }) => tabTriggerClass(isActive, 'flex items-center', 'page')}>
            <AppIcon id="settings" size={14} />
          </NavLink>
        </div>
      </nav>
    </header>
  )
}
