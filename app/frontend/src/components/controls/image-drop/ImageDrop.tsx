import { AppIcon } from '@/components/composites/chrome/AppIcon.tsx'
import { useEffect, useRef, useState } from 'react'

function isImage(file: File) {
  return file.type.startsWith('image/')
}

function isSafetensors(file: File) {
  return file.name.toLowerCase().endsWith('.safetensors')
}

function allowed(file: File, accept: string) {
  const tokens = accept.split(',').map((item) => item.trim().toLowerCase())
  if (isImage(file) && tokens.some((token) => token === 'image/*' || token.startsWith('image/'))) {
    return true
  }
  if (isSafetensors(file) && tokens.includes('.safetensors')) {
    return true
  }
  return false
}

type ImageDropProps = {
  onFile?: (file: File | null) => void
  onFiles?: (files: File[]) => void
  files?: File[]
  multiple?: boolean
  className?: string
  accept?: string
  placeholder?: string
  initialLabel?: string | null
  initialSrc?: string | null
}

export function ImageDrop({
  onFile,
  onFiles,
  files,
  multiple = false,
  className = 'h-48',
  accept = 'image/*',
  placeholder = 'Drop an image here, or click to pick',
  initialLabel = null,
  initialSrc = null,
}: ImageDropProps) {
  const [src, setSrc] = useState<string | null>(initialSrc)
  const [label, setLabel] = useState<string | null>(initialLabel)
  const [over, setOver] = useState(false)
  const [thumbs, setThumbs] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  useEffect(() => {
    return () => {
      if (src?.startsWith('blob:')) {
        URL.revokeObjectURL(src)
      }
    }
  }, [src])

  useEffect(() => {
    if (!multiple) {
      return
    }
    const next = (files ?? []).filter(isImage).map((file) => URL.createObjectURL(file))
    setThumbs(next)
    return () => {
      for (const url of next) {
        URL.revokeObjectURL(url)
      }
    }
  }, [files, multiple])

  function take(file: File | null) {
    setSrc((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }
      return file && isImage(file) ? URL.createObjectURL(file) : null
    })
    setLabel(file && !isImage(file) ? file.name : null)
    onFile?.(file)
  }

  function fromList(list: FileList | null) {
    const picked = [...(list ?? [])].filter((file) => allowed(file, accept))
    if (!picked.length) {
      return
    }
    if (multiple) {
      const next = [...(files ?? []), ...picked]
      onFiles?.(next)
      return
    }
    take(picked[0] ?? null)
  }

  return (
    <div
      className={[
        'relative flex cursor-pointer items-center justify-center overflow-hidden rounded border bg-field',
        className,
        over ? 'border-accent' : 'border-line',
      ].join(' ')}
      onClick={() => input.current?.click()}
      onDragEnter={(event) => {
        event.preventDefault()
        dragDepth.current += 1
        setOver(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
      }}
      onDragLeave={() => {
        dragDepth.current -= 1
        if (dragDepth.current <= 0) {
          dragDepth.current = 0
          setOver(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        dragDepth.current = 0
        setOver(false)
        fromList(event.dataTransfer.files)
      }}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          fromList(event.target.files)
          event.target.value = ''
        }}
      />
      {multiple ? (
        thumbs.length ? (
          <div className="flex min-h-48 w-full flex-wrap content-start gap-cluster p-2">
            {thumbs.map((url, index) => (
              <div key={`${url}-${index}`} className="relative h-20 w-20 overflow-hidden rounded border border-line bg-bg">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded bg-bg/80 text-muted hover:text-ink"
                  aria-label="Remove file"
                  onClick={(event) => {
                    event.stopPropagation()
                    onFiles?.((files ?? []).filter((_, item) => item !== index))
                  }}
                >
                  <AppIcon id="x" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <>
            <AppIcon id="upload" size={64} className="pointer-events-none absolute text-muted opacity-20" />
            <p className="px-3 text-center text-sm text-muted">{placeholder}</p>
          </>
        )
      ) : (
        <>
          {src || label ? null : (
            <AppIcon id="upload" size={64} className="pointer-events-none absolute text-muted opacity-20" />
          )}
          {src || label ? (
            <>
              {src ? <img src={src} alt="Dropped" className="absolute inset-0 h-full w-full object-contain" /> : null}
              {label ? (
                <p className="z-10 px-3 text-center text-sm break-all text-ink">{label}</p>
              ) : null}
              <button
                type="button"
                className="absolute top-1.5 right-1.5 z-10 flex h-7 w-7 items-center justify-center rounded bg-bg/80 text-muted hover:text-ink"
                aria-label="Remove file"
                onClick={(event) => {
                  event.stopPropagation()
                  take(null)
                }}
              >
                <AppIcon id="x" />
              </button>
            </>
          ) : (
            <p className="px-3 text-center text-sm text-muted">{placeholder}</p>
          )}
        </>
      )}
    </div>
  )
}
