import { FolderField } from '@/components/controls/folder-field/FolderField.tsx'
import { ImageDrop } from '@/components/controls/image-drop/ImageDrop.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { DatasetTabStrip } from '@/views/generate/panels/generation/sections/params/DatasetTabStrip.tsx'
import { SpritesFields } from '@/views/generate/panels/generation/sections/params/SpritesFields.tsx'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useEffect, useState } from 'react'

export function DatasetParams() {
  const dataset = useGenerateStore((s) => s.dataset)
  const datasetFiles = useGenerateStore((s) => s.datasetFiles)
  const outputImagePath = useGenerateStore((s) => s.outputImagePath)
  const setDataset = useGenerateStore((s) => s.setDataset)
  const setDatasetFiles = useGenerateStore((s) => s.setDatasetFiles)
  const setOutputImagePath = useGenerateStore((s) => s.setOutputImagePath)
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    if (!datasetFiles.length) {
      setSelectedIndex(0)
      return
    }
    setSelectedIndex((index) => Math.max(0, Math.min(index, datasetFiles.length - 1)))
  }, [datasetFiles])

  return (
    <div className="flex min-w-0 w-full flex-col gap-stack">
      <SegmentSwitch
        fill
        value={dataset.inputMode}
        tone="blue"
        options={[
          { id: 'files', label: 'Files' },
          { id: 'directory', label: 'Directory' },
        ]}
        onChange={(inputMode) => setDataset({ inputMode })}
      />
      {dataset.inputMode === 'directory' ? (
        <div className="flex w-full min-w-0 flex-col gap-1 overflow-hidden">
          <span className="text-xs text-muted">Input folder</span>
          <FolderField
            value={dataset.inputDir}
            onChange={(inputDir) => setDataset({ inputDir })}
            placeholder="Folder of images"
          />
        </div>
      ) : (
        <ImageDrop
          multiple
          files={datasetFiles}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onFiles={setDatasetFiles}
          className="min-h-48 w-full min-w-0 max-w-full"
          placeholder="Drop or paste images here, or click to pick"
        />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted">Output folder</span>
        <FolderField
          value={outputImagePath}
          onChange={setOutputImagePath}
          placeholder="dataset_prep/[date]"
        />
      </div>
      <DatasetTabStrip value={dataset.tab} onValueChange={(tab) => setDataset({ tab })} />
      {dataset.tab === 'sprites' ? (
        <SpritesFields value={dataset.sprites} onChange={(sprites) => setDataset({ sprites })} />
      ) : null}
    </div>
  )
}
