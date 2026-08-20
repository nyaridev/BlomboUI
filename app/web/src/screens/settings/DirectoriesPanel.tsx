import { FolderField } from '@/components/FolderField.tsx'
import { FolderList, LOCAL_ID, OUTPUT_ID } from '@/components/FolderList.tsx'
import { getAppPaths, setOutputPath, type AppPaths } from '@/lib/api.ts'
import { useIssuesStore } from '@/stores/issuesStore.ts'
import { useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { SettingsBlock, SettingsCard } from './SettingsBlock.tsx'
import { useEffect, useMemo, useRef, useState } from 'react'

export const DIRECTORIES_QUERY =
  'directories folders models wildcards output gallery extra roots local path browse download'

export function DirectoriesPanel({ query = '' }: { query?: string }) {
  const modelDirs = useSettingsStore((s) => s.modelDirs)
  const wildcardDirs = useSettingsStore((s) => s.wildcardDirs)
  const galleryDirs = useSettingsStore((s) => s.galleryDirs)
  const forceDownloadModelsLocal = useSettingsStore((s) => s.forceDownloadModelsLocal)
  const forceDownloadWildcardsLocal = useSettingsStore((s) => s.forceDownloadWildcardsLocal)
  const setModelDirs = useSettingsStore((s) => s.setModelDirs)
  const setWildcardDirs = useSettingsStore((s) => s.setWildcardDirs)
  const setGalleryDirs = useSettingsStore((s) => s.setGalleryDirs)
  const setForceDownloadModelsLocal = useSettingsStore((s) => s.setForceDownloadModelsLocal)
  const setForceDownloadWildcardsLocal = useSettingsStore((s) => s.setForceDownloadWildcardsLocal)
  const [paths, setPaths] = useState<AppPaths | null>(null)
  const [outputError, setOutputError] = useState<string | null>(null)
  const skipReload = useRef(true)
  const galleryItems = useMemo(
    () => [{ id: OUTPUT_ID, name: 'Output', path: '' }, ...galleryDirs.filter((item) => item.id !== OUTPUT_ID)],
    [galleryDirs],
  )

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

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <SettingsCard query={query} title="Models" terms="models extra folders checkpoints loras local download">
        <FolderList
          items={modelDirs}
          onChange={setModelDirs}
          prefix="Models"
          lockedId={LOCAL_ID}
          livePaths={{ [LOCAL_ID]: paths?.models || '' }}
        />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={forceDownloadModelsLocal}
            onChange={(event) => setForceDownloadModelsLocal(event.target.checked)}
          />
          Force download to the Local folder
        </label>
        <p className="text-xs text-muted">
          Extra folders use the same layout as user/models (checkpoints/, loras/, vae/, controlnet/, embeddings/).
          The folder at the top is the download target unless Force download to the Local folder is on.
          ComfyUI may need a restart to load extra checkpoints.
        </p>
      </SettingsCard>
      <SettingsCard query={query} title="Wildcards" terms="wildcards extra folders txt yaml local download">
        <FolderList
          items={wildcardDirs}
          onChange={setWildcardDirs}
          prefix="Wildcards"
          lockedId={LOCAL_ID}
          livePaths={{ [LOCAL_ID]: paths?.wildcards || '' }}
        />
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="check"
            checked={forceDownloadWildcardsLocal}
            onChange={(event) => setForceDownloadWildcardsLocal(event.target.checked)}
          />
          Force download to the Local folder
        </label>
        <p className="text-xs text-muted">The folder at the top is the download target unless Force download to the Local folder is on.</p>
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
      <SettingsCard query={query} title="Gallery" terms="gallery extra image folders output">
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
