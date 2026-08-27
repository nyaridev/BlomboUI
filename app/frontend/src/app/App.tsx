import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { getHealth, reloadApp } from '@/lib/api.ts'
import { digitKey, isTyping } from '@/lib/hotkeys.ts'
import { bindSmoothWheel } from '@/lib/smoothWheel.ts'
import { useHealthStore } from '@/stores/healthStore.ts'
import { useIssuesStore } from '@/stores/issuesStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbnailScopeStore } from '@/stores/thumbnailScopeStore.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { AppShell } from '@/components/layout/AppShell.tsx'
import { Footer } from '@/components/layout/Footer.tsx'
import { TopBar } from '@/components/layout/TopBar.tsx'
import { ViewContainer, mainOverflowHidden } from '@/components/layout/ViewContainer.tsx'
import { ToastStack } from '@/components/composites/chrome/ToastStack.tsx'
import { useRefreshModelsOnDownload } from './useRefreshModelsOnDownload.ts'
import {
  firstVisiblePath,
  mainTab,
  mainTabByPath,
  mainTabHidden,
  visibleLeftTabIds,
  visibleMainTabIds,
} from './appTabs.ts'

async function waitForHealth(up: boolean, tries: number) {
  for (let i = 0; i < tries; i++) {
    if (i) {
      await new Promise((resolve) => window.setTimeout(resolve, 250))
    }
    try {
      await getHealth()
      if (up) {
        return
      }
    } catch {
      if (!up) {
        return
      }
    }
  }
}

export function App() {
  const reloadLock = useRef(false)
  const [reloading, setReloading] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  useRefreshModelsOnDownload()
  const issueCount = useIssuesStore((s) => s.items.filter((item) => item.id == null).length)
  const health = useHealthStore((s) => s.health)
  const refreshHealth = useHealthStore((s) => s.refresh)
  const refreshModels = useModelsStore((s) => s.refresh)
  const loadModels = useModelsStore((s) => s.load)
  const loadSettings = useSettingsStore((s) => s.load)
  const loaded = useSettingsStore((s) => s.loaded)
  const thumbScopeAuto = useSettingsStore((s) => s.thumbScopeAuto)
  const localThumbAuto = useSettingsStore((s) => Object.values(s.galleryLocalScopes).some((pack) => pack.auto))
  const prompt = useGenerateStore((s) => s.prompt)
  const hiddenMainTabs = useSettingsStore((s) => s.hiddenMainTabs)
  const mainTabOrder = useSettingsStore((s) => s.mainTabOrder)
  const mainTabKeysFollowLayout = useSettingsStore((s) => s.mainTabKeysFollowLayout)
  const comfyOk = health?.comfy.reachable === true
  const comfyMissing = health?.comfy.mode === 'missing'
  const comfyRestarting = health?.comfy.restarting === true
  const leftTabs = visibleLeftTabIds(mainTabOrder, hiddenMainTabs)
  const showErrors = !hiddenMainTabs.includes('Errors')
  const fill = mainOverflowHidden(location.pathname)

  useEffect(() => {
    window.scrollTo(0, 0)
    mainRef.current?.scrollTo(0, 0)
  }, [])

  useEffect(() => bindSmoothWheel(), [])

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
    if (!comfyRestarting) {
      return
    }
    const timer = window.setInterval(() => {
      void refreshHealth()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [comfyRestarting, refreshHealth])

  useEffect(() => {
    if (!loaded) {
      return
    }
    void useThumbnailScopeStore.getState().load()
  }, [loaded])

  useEffect(() => {
    if (!loaded || (!thumbScopeAuto && !localThumbAuto)) {
      return
    }
    const timer = window.setTimeout(() => {
      void useThumbnailScopeStore.getState().refreshAuto(prompt)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [loaded, localThumbAuto, prompt, thumbScopeAuto])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat) {
        return
      }
      const digit = digitKey(event)
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && digit && digit <= 9) {
        event.preventDefault()
        const fixed = ['/', '/file-info', '/gallery', '/models', '/wildcards', '/scopes', '/errors', '/history', '/settings']
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
    if (reloadLock.current) {
      return
    }
    reloadLock.current = true
    setReloading(true)
    await reloadApp()
    await waitForHealth(false, 24)
    await waitForHealth(true, 80)
    await new Promise((resolve) => window.setTimeout(resolve, 400))
    window.location.reload()
  }

  return (
    <AppShell
      topBar={
        <TopBar
          leftTabs={leftTabs}
          showErrors={showErrors}
          issueCount={issueCount}
          comfyOk={comfyOk}
          comfyMissing={comfyMissing}
        />
      }
      footer={<Footer />}
      mainRef={mainRef}
      overflowHidden={fill}
      padded={!fill}
      overlay={
        <>
          <ToastStack />
          {reloading ? (
            <div className="reload-veil fixed inset-0 z-[80] flex items-center justify-center bg-black/55" data-overlay>
              <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-label="Reloading" />
            </div>
          ) : null}
        </>
      }
    >
      <ViewContainer pathname={location.pathname} />
    </AppShell>
  )
}
