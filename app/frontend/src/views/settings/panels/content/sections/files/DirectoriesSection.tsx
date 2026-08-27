import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { FolderField } from '@/components/controls/folder-field/FolderField.tsx'
import { FolderList, LOCAL_ID, OUTPUT_ID } from '@/components/controls/folder-list/FolderList.tsx'
import { getAppPaths, reloadComfy, setOutputPath, type AppPaths } from '@/lib/api.ts'
import { useHealthStore } from '@/stores/healthStore.ts'
import { useIssuesStore } from '@/stores/issuesStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { flushSettings, useSettingsStore } from '@/stores/settingsStore.ts'
import { SettingsBlock, SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { useEffect, useMemo, useRef, useState } from 'react'

export const DIRECTORIES_QUERY =
  'directories folders models wildcards output gallery extra roots local path browse download civitai reload comfyui restart'

export function DirectoriesSection({ query = '' }: { query?: string }) {
  const modelDirs = useSettingsStore((s) => s.modelDirs)
  const wildcardDirs = useSettingsStore((s) => s.wildcardDirs)
  const galleryDirs = useSettingsStore((s) => s.galleryDirs)
  const loaded = useSettingsStore((s) => s.loaded)
  const setModelDirs = useSettingsStore((s) => s.setModelDirs)
  const setWildcardDirs = useSettingsStore((s) => s.setWildcardDirs)
  const setGalleryDirs = useSettingsStore((s) => s.setGalleryDirs)
  const [paths, setPaths] = useState<AppPaths | null>(null)
  const [outputError, setOutputError] = useState<string | null>(null)
  const [reloadError, setReloadError] = useState<string | null>(null)
  const [reloadingComfy, setReloadingComfy] = useState(false)
  const skipReload = useRef(true)
  const savedModelDirs = useRef<string | null>(null)
  const modelDirsKey = useMemo(() => JSON.stringify(modelDirs), [modelDirs])
  const galleryItems = useMemo(
    () => [{ id: OUTPUT_ID, name: 'Output', path: '' }, ...galleryDirs.filter((item) => item.id !== OUTPUT_ID)],
    [galleryDirs],
  )

  useEffect(() => {
    if (loaded && savedModelDirs.current === null) {
      savedModelDirs.current = modelDirsKey
    }
  }, [loaded, modelDirsKey])

  useEffect(() => {
    void getAppPaths()
      .then(setPaths)
      .catch(() => setPaths(null))
  }, [])

  useEffect(() => {
    if (skipReload.current) {
      skipReload.current = false
      return
    }
    const timer = window.setTimeout(() => {
      void useModelsStore.getState().pull()
      void useIssuesStore.getState().load()
    }, 400)
    return () => window.clearTimeout(timer)
  }, [galleryDirs, modelDirs, wildcardDirs])

  async function commitOutput(path: string) {
    setOutputError(null)
    try {
      setPaths(await setOutputPath(path))
      void useIssuesStore.getState().load()
    } catch (err) {
      setOutputError(err instanceof Error ? err.message : 'Could not set output folder')
    }
  }

  async function commitModelPaths() {
    setReloadError(null)
    setReloadingComfy(true)
    try {
      await flushSettings()
      const requestedModelDirs = JSON.stringify(useSettingsStore.getState().modelDirs)
      await reloadComfy()
      savedModelDirs.current = requestedModelDirs
      void useHealthStore.getState().refresh()
    } catch (err) {
      setReloadError(err instanceof Error ? err.message : 'Could not reload ComfyUI')
    } finally {
      setReloadingComfy(false)
    }
  }

  const modelPathsChanged =
    loaded && savedModelDirs.current !== null && savedModelDirs.current !== modelDirsKey

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <SettingsCard query={query} title="Models" terms="models extra folders checkpoints loras local download" setting="modelDirs">
        <FolderList
          items={modelDirs}
          onChange={setModelDirs}
          prefix="Models"
          lockedId={LOCAL_ID}
          livePaths={{ [LOCAL_ID]: paths?.models || '' }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={[
              'flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-semibold',
              modelPathsChanged
                ? 'border-accent bg-accent text-ink'
                : 'border-line bg-field text-muted',
              'disabled:cursor-not-allowed disabled:opacity-60',
            ].join(' ')}
            disabled={!modelPathsChanged || reloadingComfy}
            title={modelPathsChanged ? 'Write extra model paths and restart ComfyUI' : 'Edit a model path to enable'}
            onClick={() => void commitModelPaths()}
          >
            <AppIcon id="refresh-cw" size={14} />
            {reloadingComfy ? 'Reloading ComfyUI…' : 'Reload ComfyUI'}
          </button>
          {reloadError ? <span className="text-xs text-accent">{reloadError}</span> : null}
        </div>
        <p className="text-xs text-muted">
          Extra folders use the same layout as user/models (checkpoints/, loras/, vae/, controlnet/, embeddings/).
          Change a model path, then reload ComfyUI to make the extra model paths available there. Download targets are
          configured under Civitai → Download.
        </p>
      </SettingsCard>
      <SettingsCard query={query} title="Wildcards" terms="wildcards extra folders txt yaml local download" setting="wildcardDirs">
        <FolderList
          items={wildcardDirs}
          onChange={setWildcardDirs}
          prefix="Wildcards"
          lockedId={LOCAL_ID}
          livePaths={{ [LOCAL_ID]: paths?.wildcards || '' }}
        />
        <p className="text-xs text-muted">Configure the wildcard download target under Civitai → Download.</p>
      </SettingsCard>
      <SettingsCard query={query} title="Output" terms="output save root folder images">
        <SettingsBlock query={query} title="Save folder" terms="output path browse" className="flex flex-col gap-2">
          <FolderField
            value={paths?.output || ''}
            onChange={(path) => void commitOutput(path)}
            placeholder="Output folder"
          />
          {outputError ? <p className="text-xs text-accent">{outputError}</p> : null}
        </SettingsBlock>
      </SettingsCard>
      <SettingsCard query={query} title="Gallery" terms="gallery extra image folders output" setting="galleryDirs">
        <FolderList
          items={galleryItems}
          onChange={(items) => setGalleryDirs(items.filter((item) => item.id !== OUTPUT_ID))}
          prefix="Gallery"
          lockedId={OUTPUT_ID}
          livePaths={{ [OUTPUT_ID]: paths?.output || '' }}
          pinLocked
        />
        <p className="text-xs text-muted">Extra folders are listed on the Gallery tab with cached gallery images.</p>
      </SettingsCard>
    </div>
  )
}
