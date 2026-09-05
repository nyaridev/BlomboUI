import { FolderField } from '@/components/controls/folder-field/FolderField.tsx'
import { ImageDrop } from '@/components/controls/image-drop/ImageDrop.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { ImageUpscaleFields } from '@/views/generate/panels/generation/sections/params/ImageUpscaleFields.tsx'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useEffect, useState } from 'react'

export function ImageUpscaleParams({ lastSeed = null }: { lastSeed?: number | null }) {
  const imageUpscale = useGenerateStore((s) => s.imageUpscale)
  const imageUpscaleFiles = useGenerateStore((s) => s.imageUpscaleFiles)
  const outputImagePath = useGenerateStore((s) => s.outputImagePath)
  const setImageUpscale = useGenerateStore((s) => s.setImageUpscale)
  const setImageUpscaleFiles = useGenerateStore((s) => s.setImageUpscaleFiles)
  const setOutputImagePath = useGenerateStore((s) => s.setOutputImagePath)
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    if (!imageUpscaleFiles.length) {
      setSelectedIndex(0)
      return
    }
    setSelectedIndex((index) => Math.max(0, Math.min(index, imageUpscaleFiles.length - 1)))
  }, [imageUpscaleFiles])

  return (
    <div className="flex min-w-0 w-full flex-col gap-stack">
      <SegmentSwitch
        fill
        value={imageUpscale.inputMode}
        tone="blue"
        options={[
          { id: 'files', label: 'Files' },
          { id: 'directory', label: 'Directory' },
        ]}
        onChange={(inputMode) => setImageUpscale({ inputMode })}
      />
      {imageUpscale.inputMode === 'directory' ? (
        <div className="flex w-full min-w-0 flex-col gap-1 overflow-hidden">
          <span className="text-xs text-muted">Input folder</span>
          <FolderField
            value={imageUpscale.inputDir}
            onChange={(inputDir) => setImageUpscale({ inputDir })}
            placeholder="Folder of images"
          />
        </div>
      ) : (
        <ImageDrop
          multiple
          files={imageUpscaleFiles}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          onFiles={setImageUpscaleFiles}
          className="min-h-48 w-full min-w-0 max-w-full"
          placeholder="Drop or paste images here, or click to pick"
        />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted">Output folder</span>
        <FolderField
          value={outputImagePath}
          onChange={setOutputImagePath}
          placeholder="image_upscale/[date]"
        />
      </div>
      <ImageUpscaleFields
        value={imageUpscale}
        files={imageUpscaleFiles}
        selectedIndex={selectedIndex}
        onChange={setImageUpscale}
        lastSeed={lastSeed}
      />
    </div>
  )
}
