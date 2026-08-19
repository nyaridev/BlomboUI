import { Navigate, NavLink, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { GalleryScreen } from '../screens/gallery/GalleryScreen.tsx'
import { GenerateScreen } from '../screens/generate/GenerateScreen.tsx'
import { ModelsScreen } from '../screens/models/ModelsScreen.tsx'
import { FileInfoScreen } from '../screens/fileinfo/FileInfoScreen.tsx'
import { SettingsScreen } from '../screens/settings/SettingsScreen.tsx'
import { getHealth, reloadApp } from '../lib/api.ts'
import { useHealthStore } from '../stores/healthStore.ts'
import { useModelsStore } from '../stores/modelsStore.ts'
import { useSettingsStore } from '../stores/settingsStore.ts'
import { FooterLinks } from './FooterLinks.tsx'
import { GpuBar } from './GpuBar.tsx'
import { TemplateBar } from './TemplateBar.tsx'
import { WorkflowPicker } from './WorkflowPicker.tsx'

const nav = [
  { to: '/', label: 'Generate', end: true },
  { to: '/file-info', label: 'File Info' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/models', label: 'Models' },
  { to: '/settings', label: 'Settings' },
]

function pane(on: boolean, fill = false) {
  if (!on) {
    return 'hidden'
  }
  return fill ? 'flex h-full min-h-0 flex-col' : ''
}

export function App() {
  const [reloading, setReloading] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()
  const fileInfo = location.pathname === '/file-info'
  const settings = location.pathname === '/settings'
  const generate = location.pathname === '/'
  const gallery = location.pathname === '/gallery'
  const models = location.pathname === '/models'
  const health = useHealthStore((s) => s.health)
  const refreshHealth = useHealthStore((s) => s.refresh)
  const refreshModels = useModelsStore((s) => s.refresh)
  const loadModels = useModelsStore((s) => s.load)
  const loadSettings = useSettingsStore((s) => s.load)
  const theme = useSettingsStore((s) => s.theme)
  const comfyOk = health?.comfy.reachable === true
  const comfyMissing = health?.comfy.mode === 'missing'

  useEffect(() => {
    window.scrollTo(0, 0)
    mainRef.current?.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    void refreshHealth()
    void loadModels()
    void loadSettings()
    const timer = window.setInterval(() => {
      void refreshHealth()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [loadModels, loadSettings, refreshHealth])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'r' || event.repeat) {
        return
      }
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return
      }
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return
        }
      }
      event.preventDefault()
      void refreshModels()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [refreshModels])

  async function onReload() {
    if (reloading) {
      return
    }
    setReloading(true)
    await reloadApp()
    for (let i = 0; i < 80; i++) {
      await new Promise((resolve) => window.setTimeout(resolve, 250))
      try {
        await getHealth()
        window.location.reload()
        return
      } catch {
        continue
      }
    }
    window.location.reload()
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="flex flex-col bg-panel px-4 pt-2">
        <div className="flex items-center gap-2 pb-2">
          <WorkflowPicker />
          <TemplateBar />
          <div className="ml-auto flex items-center gap-3">
            {!comfyOk ? (
              <p className="text-xs text-muted">
                {comfyMissing ? 'Run install\\install-comfyui.bat, then relaunch.' : 'ComfyUI backend is starting…'}
              </p>
            ) : (
              <GpuBar />
            )}
          </div>
        </div>
        <nav className="flex gap-1 border-b border-line px-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  '-mb-px rounded-t-md border px-3 py-1.5 text-sm',
                  isActive
                    ? 'border-line border-b-bg bg-bg text-ink'
                    : 'border-transparent text-muted hover:text-ink',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main
        ref={mainRef}
        className={[
          'min-h-0 flex-1 [overflow-anchor:none]',
          settings || fileInfo ? 'overflow-hidden' : 'overflow-y-auto',
        ].join(' ')}
      >
        <div className={['flex h-full min-h-0 flex-col', settings || fileInfo ? '' : 'px-10 py-4'].join(' ')}>
          {location.pathname === '/png-info' ? <Navigate to="/file-info" replace /> : null}
          <div className={pane(generate, true)}>
            <GenerateScreen />
          </div>
          <div className={pane(fileInfo, true)}>
            <FileInfoScreen />
          </div>
          <div className={pane(gallery)}>
            <GalleryScreen />
          </div>
          <div className={pane(models)}>
            <ModelsScreen />
          </div>
          <div className={pane(settings, true)}>
            <SettingsScreen />
          </div>
        </div>
      </main>
      <footer className="flex h-8 items-center border-t border-line bg-panel px-4">
        <button
          type="button"
          className="text-xs text-muted hover:text-ink disabled:opacity-40"
          disabled={reloading}
          onClick={() => void onReload()}
        >
          {reloading ? 'Reloading…' : 'Reload'}
        </button>
        <FooterLinks comfyUrl={health?.comfy.url || 'http://127.0.0.1:8188'} />
      </footer>
    </div>
  )
}
