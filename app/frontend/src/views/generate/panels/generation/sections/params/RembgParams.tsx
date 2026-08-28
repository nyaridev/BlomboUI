import { FolderField } from '@/components/controls/folder-field/FolderField.tsx'
import { ImageDrop } from '@/components/controls/image-drop/ImageDrop.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { RembgFields } from '@/views/generate/panels/generation/sections/params/RembgFields.tsx'
import { useGenerateStore } from '@/stores/generateStore.ts'

export function RembgParams() {
  const rembg = useGenerateStore((s) => s.rembg)
  const rembgFiles = useGenerateStore((s) => s.rembgFiles)
  const outputImagePath = useGenerateStore((s) => s.outputImagePath)
  const setRembg = useGenerateStore((s) => s.setRembg)
  const setRembgFiles = useGenerateStore((s) => s.setRembgFiles)
  const setOutputImagePath = useGenerateStore((s) => s.setOutputImagePath)

  return (
    <div className="flex flex-col gap-stack">
      <SegmentSwitch
        fill
        value={rembg.inputMode}
        tone="blue"
        options={[
          { id: 'files', label: 'Files' },
          { id: 'directory', label: 'Directory' },
        ]}
        onChange={(inputMode) => setRembg({ inputMode })}
      />
      {rembg.inputMode === 'directory' ? (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Input folder</span>
          <FolderField
            value={rembg.inputDir}
            onChange={(inputDir) => setRembg({ inputDir })}
            placeholder="Folder of images"
          />
        </div>
      ) : (
        <ImageDrop
          multiple
          files={rembgFiles}
          onFiles={setRembgFiles}
          className="min-h-48"
          placeholder="Drop images here, or click to pick"
        />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted">Output folder</span>
        <FolderField
          value={outputImagePath}
          onChange={setOutputImagePath}
          placeholder="background_removal/[date]"
        />
      </div>
      <RembgFields value={rembg} onChange={setRembg} />
    </div>
  )
}
