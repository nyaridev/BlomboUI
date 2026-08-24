import { SelectField } from '@/components/primitives/SelectField.tsx'
import { getAppPaths } from '@/lib/api.ts'
import { SettingsCard } from './SettingsBlock.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useEffect, useState } from 'react'

export const DOWNLOAD_QUERY =
  'download civitai model wildcard directory folder intelligent sort base model category creator naming author alias archive unpack zip'

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
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  label: string
  onChange: (value: boolean) => void
}) {
  return (
    <label className={['flex items-center gap-2 text-sm', disabled ? 'text-muted' : 'text-ink'].join(' ')}>
      <input
        type="checkbox"
        className="check"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

export function DownloadPanel({ query = '' }: { query?: string }) {
  const modelDirs = useSettingsStore((state) => state.modelDirs)
  const wildcardDirs = useSettingsStore((state) => state.wildcardDirs)
  const download = useSettingsStore((state) => state.civitaiDownload)
  const setDownload = useSettingsStore((state) => state.setCivitaiDownload)
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
      <SettingsCard query={query} title="Models" terms="civitai model downloads destination folder">
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="text-xs text-muted">Download directory</span>
          <SelectField
            value={download.modelDirId}
            onChange={(value) => setDownload({ modelDirId: value })}
            options={directoryOptions(modelDirs)}
          />
        </label>
        <div className="flex flex-col gap-2 rounded border border-line bg-bg p-2">
          <p className="text-xs uppercase tracking-wide text-muted">Intelligent download</p>
          <Check
            checked={download.modelIntelligent}
            label="Sort downloaded models into folders"
            onChange={(value) => setDownload({ modelIntelligent: value })}
          />
          <div className="ml-6 flex flex-col gap-2">
            <Check
              checked={download.modelSortBaseModel}
              disabled={!download.modelIntelligent}
              label="Sort by base model"
              onChange={(value) => setDownload({ modelSortBaseModel: value })}
            />
            <Check
              checked={download.modelSortCategory}
              disabled={!download.modelIntelligent}
              label="Sort by category"
              onChange={(value) => setDownload({ modelSortCategory: value })}
            />
            <Check
              checked={download.modelSortCreator}
              disabled={!download.modelIntelligent}
              label="Sort by creator"
              onChange={(value) => setDownload({ modelSortCreator: value })}
            />
          </div>
          <p className="text-xs text-muted">
            Example: <span className="text-ink">{examplePath}</span>. The path updates with the sorting options; a
            custom creator prefix only changes the filename.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm text-ink">
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
        <p className="text-xs text-muted">
          Custom naming opens a dialog where the model name and creator filename prefix can be edited per download.
        </p>
        <Check
          checked={download.updateModelInfo}
          label="Automatically update model info after downloading"
          onChange={(value) => setDownload({ updateModelInfo: value })}
        />
        <p className="text-xs text-muted">
          Saves the CivitAI thumbnail, model type, and LoRA trigger words when available.
        </p>
      </SettingsCard>

      <SettingsCard query={query} title="Wildcards" terms="civitai wildcard downloads destination folder archive zip">
        <label className="flex flex-col gap-1 text-sm text-ink">
          <span className="text-xs text-muted">Download directory</span>
          <SelectField
            value={download.wildcardDirId}
            onChange={(value) => setDownload({ wildcardDirId: value })}
            options={directoryOptions(wildcardDirs)}
          />
        </label>
        <Check
          checked={download.wildcardIntelligent}
          label="Intelligent download"
          onChange={(value) => setDownload({ wildcardIntelligent: value })}
        />
        <Check
          checked={download.wildcardUnpack}
          label="Unpack archives (.zip and similar)"
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
