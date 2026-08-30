import { FolderField } from '@/components/controls/folder-field/FolderField.tsx'
import { ImageDrop } from '@/components/controls/image-drop/ImageDrop.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { ImageUpscaleFields } from '@/views/generate/panels/generation/sections/params/ImageUpscaleFields.tsx'
import { useGenerateStore } from '@/stores/generateStore.ts'

export function ImageUpscaleParams({ lastSeed = null }: { lastSeed?: number | null }) {
  const imageUpscale = useGenerateStore((s) => s.imageUpscale)
  const imageUpscaleFiles = useGenerateStore((s) => s.imageUpscaleFiles)
  const outputImagePath = useGenerateStore((s) => s.outputImagePath)
  const setImageUpscale = useGenerateStore((s) => s.setImageUpscale)
  const setImageUpscaleFiles = useGenerateStore((s) => s.setImageUpscaleFiles)
  const setOutputImagePath = useGenerateStore((s) => s.setOutputImagePath)

  return (
    <div className="flex flex-col gap-stack">
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
        <div className="flex min-w-0 flex-col gap-1">
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
          onFiles={setImageUpscaleFiles}
          className="min-h-48"
          placeholder="Drop images here, or click to pick"
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
      <SegmentSwitch
        fill
        value={imageUpscale.engine}
        tone="blue"
        options={[
          { id: 'model', label: 'Upscale model' },
          { id: 'seedvr2', label: 'SeedVR2' },
        ]}
        onChange={(engine) => setImageUpscale({ engine })}
      />
      <ImageUpscaleFields value={imageUpscale} files={imageUpscaleFiles} onChange={setImageUpscale} lastSeed={lastSeed} />
    </div>
  )
}
