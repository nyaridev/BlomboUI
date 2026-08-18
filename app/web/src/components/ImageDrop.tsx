import { useEffect, useRef, useState } from 'react'

function isImage(file: File) {
  return file.type.startsWith('image/')
}

type ImageDropProps = {
  onFile?: (file: File | null) => void
  className?: string
}

export function ImageDrop({ onFile, className = 'h-48' }: ImageDropProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  useEffect(() => {
    return () => {
      if (src) {
        URL.revokeObjectURL(src)
      }
    }
  }, [src])

  function take(file: File | null) {
    setSrc((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }
      return file ? URL.createObjectURL(file) : null
    })
    onFile?.(file)
  }

  function fromList(files: FileList | null) {
    const file = files?.[0]
    if (file && isImage(file)) {
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
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          fromList(event.target.files)
          event.target.value = ''
        }}
      />
      {src ? null : (
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
      {src ? (
        <>
          <img src={src} alt="Dropped" className="absolute inset-0 h-full w-full object-contain" />
          <button
            type="button"
            className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded bg-bg/80 text-muted hover:text-ink"
            aria-label="Remove image"
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
        <p className="px-3 text-center text-sm text-muted">Drop an image here, or click to pick</p>
      )}
    </div>
  )
}
