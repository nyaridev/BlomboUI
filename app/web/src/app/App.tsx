import { Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { GalleryScreen } from '../screens/gallery/GalleryScreen.tsx'
import { GenerateScreen } from '../screens/generate/GenerateScreen.tsx'
import { ModelsScreen } from '../screens/models/ModelsScreen.tsx'
import { FileInfoScreen } from '../screens/fileinfo/FileInfoScreen.tsx'
import { SettingsScreen } from '../screens/settings/SettingsScreen.tsx'
import { ErrorsScreen } from '../screens/errors/ErrorsScreen.tsx'
import { getHealth, reloadApp } from '../lib/api.ts'
import { digitKey, isTyping } from '../lib/hotkeys.ts'
import { bindSmoothWheel } from '../lib/smoothWheel.ts'
import { useHealthStore } from '../stores/healthStore.ts'
import { useIssuesStore } from '../stores/issuesStore.ts'
import { useModelsStore } from '../stores/modelsStore.ts'
import { useSettingsStore } from '../stores/settingsStore.ts'
import { FooterLinks } from './FooterLinks.tsx'
import { GpuBar } from './GpuBar.tsx'
import { TemplateBar } from './TemplateBar.tsx'
import { ToastStack } from './ToastStack.tsx'
import { WorkflowPicker } from './WorkflowPicker.tsx'
import {
  firstVisiblePath,
  mainTab,
  mainTabByPath,
  mainTabHidden,
  visibleLeftTabIds,
  visibleMainTabIds,
} from './appTabs.ts'

function tabClass(isActive: boolean, extra = '') {
  return [
    extra,
    '-mb-px rounded-t-md border px-3 py-1.5 text-sm',
    isActive ? 'border-line border-b-bg bg-bg text-ink' : 'border-transparent text-muted hover:text-ink',
  ].join(' ')
}

function pane(on: boolean, fill = false) {
  if (!on) {
    return 'hidden'
  }
  return fill ? 'flex h-full min-h-0 flex-col' : 'flex min-h-full flex-col'
}

export function App() {
  const reloading = useRef(false)
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const fileInfo = location.pathname === '/file-info'
  const settings = location.pathname === '/settings'
  const generate = location.pathname === '/'
  const gallery = location.pathname === '/gallery'
  const models = location.pathname === '/models'
  const errors = location.pathname === '/errors'
  const issueCount = useIssuesStore((s) => s.items.length)
  const health = useHealthStore((s) => s.health)
  const refreshHealth = useHealthStore((s) => s.refresh)
  const refreshModels = useModelsStore((s) => s.refresh)
  const loadModels = useModelsStore((s) => s.load)
  const loadSettings = useSettingsStore((s) => s.load)
  const theme = useSettingsStore((s) => s.theme)
  const loaded = useSettingsStore((s) => s.loaded)
  const hiddenMainTabs = useSettingsStore((s) => s.hiddenMainTabs)
  const mainTabOrder = useSettingsStore((s) => s.mainTabOrder)
  const mainTabKeysFollowLayout = useSettingsStore((s) => s.mainTabKeysFollowLayout)
  const comfyOk = health?.comfy.reachable === true
  const comfyMissing = health?.comfy.mode === 'missing'
  const leftTabs = visibleLeftTabIds(mainTabOrder, hiddenMainTabs)
  const showErrors = !hiddenMainTabs.includes('Errors')

  useEffect(() => {
    window.scrollTo(0, 0)
    mainRef.current?.scrollTo(0, 0)
  }, [])

  useEffect(() => bindSmoothWheel(), [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (!loaded) {
      return
    }
    const tab = mainTabByPath(location.pathname)
    if (!tab || !mainTabHidden(tab.id, hiddenMainTabs)) {
      return
    }
    navigate(firstVisiblePath(mainTabOrder, hiddenMainTabs), { replace: true })
  }, [hiddenMainTabs, loaded, location.pathname, mainTabOrder, navigate])

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
      if (event.repeat) {
        return
      }
      const digit = digitKey(event)
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && digit && digit <= 6) {
        event.preventDefault()
        const fixed = ['/', '/file-info', '/gallery', '/models', '/errors', '/settings']
        const routes = mainTabKeysFollowLayout
          ? visibleMainTabIds(mainTabOrder, hiddenMainTabs).map((id) => mainTab(id)?.to ?? '/')
          : fixed
        const to = routes[digit - 1]
        if (!to) {
          return
        }
        if (!mainTabKeysFollowLayout) {
          const tab = mainTabByPath(to)
          if (tab && mainTabHidden(tab.id, hiddenMainTabs)) {
            return
          }
        }
        navigate(to)
        return
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        void onReload()
        return
      }
      if (event.key.toLowerCase() !== 'r' || event.ctrlKey || event.altKey || event.metaKey) {
        return
      }
      if (isTyping(event)) {
        return
      }
      event.preventDefault()
      void refreshModels()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hiddenMainTabs, mainTabKeysFollowLayout, mainTabOrder, navigate, refreshModels])

  async function onReload() {
    if (reloading.current) {
      return
    }
    reloading.current = true
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
          {leftTabs.map((id) => {
            const item = mainTab(id)
            if (!item) {
              return null
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => tabClass(isActive)}
              >
                {item.label}
              </NavLink>
            )
          })}
          <div className="ml-auto flex gap-1">
            {showErrors ? (
              <NavLink to="/errors" className={({ isActive }) => tabClass(isActive, 'flex items-center')}>
                Errors
                {issueCount > 0 ? (
                  <span className="ml-1.5 rounded-full bg-red-800 px-1.5 text-[10px] leading-4 text-ink">{issueCount}</span>
                ) : null}
              </NavLink>
            ) : null}
            <NavLink to="/settings" className={({ isActive }) => tabClass(isActive)}>
              Settings
            </NavLink>
          </div>
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
          <div className={pane(generate)}>
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
          <div className={pane(errors)}>
            <ErrorsScreen />
          </div>
        </div>
      </main>
      <footer className="flex h-8 items-center border-t border-line bg-panel px-4">
        <FooterLinks comfyUrl={health?.comfy.url || 'http://127.0.0.1:8188'} />
      </footer>
      <ToastStack />
    </div>
  )
}
