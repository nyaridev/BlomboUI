import { FolderField } from '@/components/controls/folder-field/FolderField.tsx'
import { ImageDrop } from '@/components/controls/image-drop/ImageDrop.tsx'
import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { CaptionFields } from '@/views/generate/panels/generation/sections/params/CaptionFields.tsx'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { useEffect, useRef } from 'react'

const NAME =
  'box-border h-toolbar min-w-0 w-full rounded border border-line bg-field px-2 py-0 font-mono text-sm leading-[1.875rem] text-ink outline-none placeholder:text-muted focus:border-accent'

export function CaptionParams({ lastSeed = null }: { lastSeed?: number | null }) {
  const caption = useGenerateStore((s) => s.caption)
  const captionFiles = useGenerateStore((s) => s.captionFiles)
  const outputImagePath = useGenerateStore((s) => s.outputImagePath)
  const outputImageName = useGenerateStore((s) => s.outputImageName)
  const setCaption = useGenerateStore((s) => s.setCaption)
  const setCaptionFiles = useGenerateStore((s) => s.setCaptionFiles)
  const setOutputImagePath = useGenerateStore((s) => s.setOutputImagePath)
  const setOutputImageName = useGenerateStore((s) => s.setOutputImageName)

  const seededName = useRef(false)

  useEffect(() => {
    if (!seededName.current && !outputImageName) {
      setOutputImageName('[index]')
    }
    seededName.current = true
  }, [outputImageName, setOutputImageName])

  return (
    <div className="flex flex-col gap-stack">
      <SegmentSwitch
        fill
        value={caption.inputMode}
        tone="blue"
        options={[
          { id: 'files', label: 'Files' },
          { id: 'directory', label: 'Directory' },
        ]}
        onChange={(inputMode) => setCaption({ inputMode })}
      />
      {caption.inputMode === 'directory' ? (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Input folder</span>
          <FolderField
            value={caption.inputDir}
            onChange={(inputDir) => setCaption({ inputDir })}
            placeholder="Folder of images"
          />
        </div>
      ) : (
        <ImageDrop
          multiple
          files={captionFiles}
          onFiles={setCaptionFiles}
          className="min-h-48"
          placeholder="Drop or paste images here, or click to pick"
        />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted">Output folder</span>
        <FolderField
          value={outputImagePath}
          onChange={setOutputImagePath}
          placeholder="image_caption/[date]"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted">Output name</span>
        <input
          className={NAME}
          value={outputImageName}
          onChange={(event) => setOutputImageName(event.target.value)}
          placeholder="[index]"
          spellCheck={false}
        />
        <span className="text-xs text-muted">Empty uses the original filenames. Tokens: [index], [filename]</span>
      </div>
      <CaptionFields value={caption} onChange={setCaption} lastSeed={lastSeed} />
    </div>
  )
}
