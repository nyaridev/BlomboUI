import { ExpandSection } from '@/components/controls/expand-section/ExpandSection.tsx'
import { previewPath } from '@/views/settings/panels/content/sections/files/SavingSection.tsx'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { Link } from 'react-router-dom'

const INPUT =
  'w-full rounded border border-line bg-field px-2 py-1.5 font-mono text-sm text-ink outline-none placeholder:text-muted focus:border-accent'

const CARD = 'flex flex-col gap-2 rounded-md border border-line bg-panel p-2'

type OutputPathOverrideProps = {
  imagePath: string
  gridPath: string
  imageName: string
  gridName: string
  hiresPath: string
  hiresName: string
  enabled: boolean
  onImagePath: (value: string) => void
  onGridPath: (value: string) => void
  onImageName: (value: string) => void
  onGridName: (value: string) => void
  onHiresPath: (value: string) => void
  onHiresName: (value: string) => void
  onEnabled: (value: boolean) => void
}

function PathCard({
  title,
  nameLabel,
  folderLabel,
  name,
  folder,
  namePlaceholder,
  folderPlaceholder,
  nameExample,
  folderExample,
  onName,
  onFolder,
}: {
  title: string
  nameLabel: string
  folderLabel: string
  name: string
  folder: string
  namePlaceholder: string
  folderPlaceholder: string
  nameExample: string
  folderExample: string
  onName: (value: string) => void
  onFolder: (value: string) => void
}) {
  return (
    <div className={CARD}>
      <p className="text-xs text-label">{title}</p>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted">{nameLabel}</span>
        <input
          className={INPUT}
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={namePlaceholder}
          spellCheck={false}
        />
        <p className="text-xs text-muted">Example: {nameExample}</p>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted">{folderLabel}</span>
        <input
          className={INPUT}
          value={folder}
          onChange={(e) => onFolder(e.target.value)}
          placeholder={folderPlaceholder}
          spellCheck={false}
        />
        <p className="text-xs text-muted">Example: {folderExample}</p>
      </label>
    </div>
  )
}

export function OutputPathOverride({
  imagePath,
  gridPath,
  imageName,
  gridName,
  hiresPath,
  hiresName,
  enabled,
  onImagePath,
  onGridPath,
  onImageName,
  onGridName,
  onHiresPath,
  onHiresName,
  onEnabled,
}: OutputPathOverrideProps) {
  const settingsImagePath = useSettingsStore((s) => s.imagePath)
  const settingsGridPath = useSettingsStore((s) => s.gridPath)
  const settingsHiresPath = useSettingsStore((s) => s.hiresPath)
  const settingsImageName = useSettingsStore((s) => s.imageName)
  const settingsGridName = useSettingsStore((s) => s.gridName)
  const settingsHiresName = useSettingsStore((s) => s.hiresName)
  const imageFormat = useSettingsStore((s) => s.imageFormat)
  const gridFormat = useSettingsStore((s) => s.gridFormat)

  return (
    <ExpandSection title="Output path" enabled={enabled} onEnabled={onEnabled} fit>
      <div className="flex flex-col gap-2">
        <PathCard
          title="Images"
          nameLabel="Name"
          folderLabel="Folder"
          name={imageName}
          folder={imagePath}
          namePlaceholder={settingsImageName}
          folderPlaceholder={settingsImagePath}
          nameExample={`${previewPath(imageName.trim() || settingsImageName)}.${imageFormat}`}
          folderExample={previewPath(imagePath.trim() || settingsImagePath)}
          onName={onImageName}
          onFolder={onImagePath}
        />
        <PathCard
          title="Grids"
          nameLabel="Name"
          folderLabel="Folder"
          name={gridName}
          folder={gridPath}
          namePlaceholder={settingsGridName}
          folderPlaceholder={settingsGridPath}
          nameExample={`${previewPath(gridName.trim() || settingsGridName)}.${gridFormat}`}
          folderExample={previewPath(gridPath.trim() || settingsGridPath)}
          onName={onGridName}
          onFolder={onGridPath}
        />
        <PathCard
          title="Hires. fix"
          nameLabel="Name"
          folderLabel="Folder"
          name={hiresName}
          folder={hiresPath}
          namePlaceholder={settingsHiresName}
          folderPlaceholder={settingsHiresPath}
          nameExample={`${previewPath(hiresName.trim() || settingsHiresName)}.${imageFormat}`}
          folderExample={previewPath(hiresPath.trim() || settingsHiresPath)}
          onName={onHiresName}
          onFolder={onHiresPath}
        />
        <p className="text-xs text-muted">
          Overwrites the Files → Saving folders and names for this generate when this section is on. Empty fields still use
          the settings values. Uses the same{' '}
          <Link to="/settings#placeholders" className="text-purple-bright underline decoration-purple-bright/50 hover:decoration-purple-bright">
            placeholders
          </Link>
          . <span className="font-mono">[number]</span> is the next free index in that folder.
        </p>
      </div>
    </ExpandSection>
  )
}
