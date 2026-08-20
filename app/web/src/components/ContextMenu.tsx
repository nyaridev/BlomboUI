import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/AppIcon.tsx'

export function ContextMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number
  y: number
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const left = Math.max(8, Math.min(x, window.innerWidth - 168))
  const top = Math.max(8, Math.min(y, window.innerHeight - 160))

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        onClose()
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[70] min-w-40 rounded border border-line bg-panel py-1 shadow-lg"
      style={{ left, top }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}

export function ContextMenuItem({
  label,
  onClick,
  danger = false,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      className={[
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-line',
        danger ? 'text-red-bright' : 'text-ink',
      ].join(' ')}
      onClick={onClick}
    >
      {danger ? <AppIcon id="trash-2" size={14} /> : null}
      <span>{label}</span>
    </button>
  )
}
