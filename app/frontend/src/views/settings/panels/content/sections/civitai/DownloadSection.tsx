import { ExpandSection } from '@/components/controls/expand-section/ExpandSection.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { NumberField } from '@/components/controls/number/NumberField.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { getAppPaths } from '@/lib/api.ts'
import { SettingsBlock, SettingsCard } from '@/views/settings/panels/content/SettingsBlock.tsx'
import { SettingsField } from '@/views/settings/panels/content/SettingsReset.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export const DOWNLOAD_QUERY =
  'download civitai model wildcard directory folder intelligent sort base model category creator naming author alias archive unpack zip queue parallel refresh reload models'

function directoryOptions(items: { id: string; name: string }[]) {
  return items.map((item) => ({ value: item.id, label: item.name }))
}

function modelExamplePath(
  intelligent: boolean,
  sortBaseModel: boolean,
  sortCategory: boolean,
  sortCreator: boolean,
  userName: string,
) {
  const parts = ['loras']
  if (intelligent) {
    if (sortBaseModel) {
      parts.push('Anima')
    }
    if (sortCategory) {
      parts.push('Style')
    }
    if (sortCreator) {
      parts.push(userName)
    }
  }
  return [...parts, 'ModelName.safetensors'].join('/')
}

function Check({
  checked,
  label,
  onChange,
  field,
}: {
  checked: boolean
  label: string
  onChange: (value: boolean) => void
  field: 'modelSortBaseModel' | 'modelSortCategory' | 'modelSortCreator' | 'updateModelInfo' | 'refreshModelsAfterDownload' | 'wildcardIntelligent' | 'wildcardUnpack'
}) {
  return (
    <SettingsField setting="civitaiDownload" field={field}>
      <label className="flex items-center gap-2 text-sm text-ink">
        <CheckboxControl checked={checked} onChange={onChange} />
        {label}
      </label>
    </SettingsField>
  )
}

export function DownloadSection({ query = '' }: { query?: string }) {
  const modelDirs = useSettingsStore((state) => state.modelDirs)
  const wildcardDirs = useSettingsStore((state) => state.wildcardDirs)
  const download = useSettingsStore((state) => state.civitaiDownload)
  const setDownload = useSettingsStore((state) => state.setCivitaiDownload)
  const downloadQueue = useSettingsStore((state) => state.downloadQueue)
  const downloadQueueParallel = useSettingsStore((state) => state.downloadQueueParallel)
  const setDownloadQueue = useSettingsStore((state) => state.setDownloadQueue)
  const setDownloadQueueParallel = useSettingsStore((state) => state.setDownloadQueueParallel)
  const [userName, setUserName] = useState('User')

  useEffect(() => {
    let alive = true
    void getAppPaths()
      .then((paths) => {
        if (alive) {
          setUserName(paths.userName?.trim() || 'User')
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  const examplePath = modelExamplePath(
    download.modelIntelligent,
    download.modelSortBaseModel,
    download.modelSortCategory,
    download.modelSortCreator,
    userName,
  )

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <SettingsCard query={query} title="Queue" terms="queue parallel downloads workers">
        <SettingsField setting="downloadQueue">
          <label className="flex items-center gap-2 text-sm text-ink">
            <CheckboxControl checked={downloadQueue} onChange={setDownloadQueue} />
            Queue downloads
          </label>
        </SettingsField>
        <p className="text-xs text-muted">
          New downloads wait in a global queue. Unchecked starts each download immediately with no cap.
        </p>
        <SettingsBlock query={query} title="Parallel downloads" terms="parallel workers limit" setting="downloadQueueParallel">
          <div className={downloadQueue ? '' : 'pointer-events-none opacity-40'}>
            <NumberField value={downloadQueueParallel} onChange={setDownloadQueueParallel} min={1} max={20} />
          </div>
        </SettingsBlock>
      </SettingsCard>
      <SettingsCard
        query={query}
        title="Models"
        terms="civitai model downloads destination folder refresh reload intelligent sort base category creator"
      >
        <SettingsField setting="civitaiDownload" field="modelDirId" className="flex items-start gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-ink">
            <span className="text-xs text-muted">Download directory</span>
            <SelectField
              value={download.modelDirId}
              onChange={(value) => setDownload({ modelDirId: value })}
              options={directoryOptions(modelDirs)}
            />
          </label>
        </SettingsField>
        <SettingsField setting="civitaiDownload" field="modelIntelligent" className="flex items-start gap-2">
          <ExpandSection
            title="Intelligent download"
            enabled={download.modelIntelligent}
            onEnabled={(value) => setDownload({ modelIntelligent: value })}
            fit
          >
          <div className="flex flex-col gap-2">
            <Check
              checked={download.modelSortBaseModel}
              label="Sort by base model"
              field="modelSortBaseModel"
              onChange={(value) => setDownload({ modelSortBaseModel: value })}
            />
            <Check
              checked={download.modelSortCategory}
              label="Sort by category"
              field="modelSortCategory"
              onChange={(value) => setDownload({ modelSortCategory: value })}
            />
            <Check
              checked={download.modelSortCreator}
              label="Sort by creator"
              field="modelSortCreator"
              onChange={(value) => setDownload({ modelSortCreator: value })}
            />
            <p className="text-xs text-muted">
              Example: <span className="text-ink">{examplePath}</span>. The path updates with the sorting options; a
              custom creator prefix only changes the filename.
            </p>
          </div>
        </ExpandSection>
        </SettingsField>
        <SettingsField setting="civitaiDownload" field="modelNaming" className="flex items-start gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-ink">
            <span className="text-xs text-muted">Naming convention</span>
            <SelectField
              value={download.modelNaming}
              onChange={(value) => setDownload({ modelNaming: value === 'custom' ? 'custom' : 'normal' })}
              options={[
                { value: 'normal', label: 'Normal name' },
                { value: 'custom', label: 'Custom name' },
              ]}
            />
          </label>
        </SettingsField>
        <p className="text-xs text-muted">
          Custom naming opens a dialog where the model name and creator filename prefix can be edited per download.
          Saved prefixes live in{' '}
          <Link
            to="/settings#author-aliases"
            className="text-purple-bright underline decoration-purple-bright/50 hover:decoration-purple-bright"
          >
            Author Aliases
          </Link>
          .
        </p>
        <Check
          checked={download.updateModelInfo}
          label="Automatically update model info after downloading"
          field="updateModelInfo"
          onChange={(value) => setDownload({ updateModelInfo: value })}
        />
        <p className="text-xs text-muted">
          Saves the CivitAI thumbnail, model type, and LoRA trigger words when available.
        </p>
        <Check
          checked={download.refreshModelsAfterDownload}
          label="Automatically refresh models after downloading"
          field="refreshModelsAfterDownload"
          onChange={(value) => setDownload({ refreshModelsAfterDownload: value })}
        />
        <p className="text-xs text-muted">
          Reloads the model list the same way as pressing R when a download finishes.
        </p>
      </SettingsCard>

      <SettingsCard query={query} title="Wildcards" terms="civitai wildcard downloads destination folder archive zip">
        <SettingsField setting="civitaiDownload" field="wildcardDirId" className="flex items-start gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-ink">
            <span className="text-xs text-muted">Download directory</span>
            <SelectField
              value={download.wildcardDirId}
              onChange={(value) => setDownload({ wildcardDirId: value })}
              options={directoryOptions(wildcardDirs)}
            />
          </label>
        </SettingsField>
        <Check
          checked={download.wildcardIntelligent}
          label="Intelligent download"
          field="wildcardIntelligent"
          onChange={(value) => setDownload({ wildcardIntelligent: value })}
        />
        <Check
          checked={download.wildcardUnpack}
          label="Unpack archives (.zip and similar)"
          field="wildcardUnpack"
          onChange={(value) => setDownload({ wildcardUnpack: value })}
        />
        <p className="text-xs text-muted">
          Supported wildcard files are safely extracted into the selected directory and the archive is removed after
          a successful extraction.
        </p>
      </SettingsCard>
    </div>
  )
}
