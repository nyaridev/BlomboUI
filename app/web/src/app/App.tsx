import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { GalleryScreen } from '../screens/gallery/GalleryScreen.tsx'
import { GenerateScreen } from '../screens/generate/GenerateScreen.tsx'
import { ModelsScreen } from '../screens/models/ModelsScreen.tsx'
import { PngInfoScreen } from '../screens/pnginfo/PngInfoScreen.tsx'
import { SettingsScreen } from '../screens/settings/SettingsScreen.tsx'
import { getHealth, reloadApp } from '../lib/api.ts'
import { useHealthStore } from '../stores/healthStore.ts'
import { useModelsStore } from '../stores/modelsStore.ts'
import { TemplateBar } from './TemplateBar.tsx'
import { WorkflowPicker } from './WorkflowPicker.tsx'

const nav = [
  { to: '/', label: 'Generate', end: true },
  { to: '/png-info', label: 'PNG Info' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/models', label: 'Models' },
  { to: '/settings', label: 'Settings' },
]

export function App() {
  const [reloading, setReloading] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()
  const pngInfo = location.pathname === '/png-info'
  const health = useHealthStore((s) => s.health)
  const refreshHealth = useHealthStore((s) => s.refresh)
  const refreshModels = useModelsStore((s) => s.refresh)
  const loadModels = useModelsStore((s) => s.load)
  const comfyOk = health?.comfy.reachable === true
  const comfyMissing = health?.comfy.mode === 'missing'

  useEffect(() => {
    window.scrollTo(0, 0)
    mainRef.current?.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    void refreshHealth()
    void loadModels()
    const timer = window.setInterval(() => {
      void refreshHealth()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [loadModels, refreshHealth])

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
          {!comfyOk ? (
            <p className="ml-auto text-xs text-muted">
              {comfyMissing ? 'Run install\\install-comfyui.bat, then relaunch.' : 'ComfyUI backend is starting…'}
            </p>
          ) : null}
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
      <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]">
        <div className="flex min-h-full flex-col px-10 py-4">
          <div className={pngInfo ? '' : 'hidden'}>
            <PngInfoScreen />
          </div>
          <Routes>
            <Route path="/" element={<GenerateScreen />} />
            <Route path="/png-info" element={null} />
            <Route path="/gallery" element={<GalleryScreen />} />
            <Route path="/models" element={<ModelsScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
          </Routes>
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
      </footer>
    </div>
  )
}
