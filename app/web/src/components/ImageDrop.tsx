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
  className?: string
  accept?: string
  placeholder?: string
  initialLabel?: string | null
  initialSrc?: string | null
}

export function ImageDrop({
  onFile,
  className = 'h-48',
  accept = 'image/*',
  placeholder = 'Drop an image here, or click to pick',
  initialLabel = null,
  initialSrc = null,
}: ImageDropProps) {
  const [src, setSrc] = useState<string | null>(initialSrc)
  const [label, setLabel] = useState<string | null>(initialLabel)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  useEffect(() => {
    return () => {
      if (src?.startsWith('blob:')) {
        URL.revokeObjectURL(src)
      }
    }
  }, [src])

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

  function fromList(files: FileList | null) {
    const file = files?.[0]
    if (file && allowed(file, accept)) {
      take(file)
    }
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
        className="hidden"
        onChange={(event) => {
          fromList(event.target.files)
          event.target.value = ''
        }}
      />
      {src || label ? null : (
        <svg
          className="pointer-events-none absolute size-16 text-muted opacity-20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 16V4" />
          <path d="m8 8 4-4 4 4" />
          <rect x="4" y="16" width="16" height="5" rx="1" />
        </svg>
      )}
      {src || label ? (
        <>
          {src ? <img src={src} alt="Dropped" className="absolute inset-0 h-full w-full object-contain" /> : null}
          {label ? (
            <p className="z-10 px-3 text-center text-sm break-all text-ink">{label}</p>
          ) : null}
          <button
            type="button"
            className="absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded bg-bg/80 text-muted hover:text-ink"
            aria-label="Remove file"
            onClick={(event) => {
              event.stopPropagation()
              take(null)
            }}
          >
            <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M3 3 11 11M11 3 3 11"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </>
      ) : (
        <p className="px-3 text-center text-sm text-muted">{placeholder}</p>
      )}
    </div>
  )
}
