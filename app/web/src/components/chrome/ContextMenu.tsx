import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '@/components/chrome/AppIcon.tsx'

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
  const left = Math.max(8, Math.min(x, window.innerWidth - 240))
  const top = Math.max(8, Math.min(y, window.innerHeight - 200))

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
      className="fixed z-[70] min-w-52 rounded border border-line bg-panel py-1 shadow-lg"
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
  icon,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  icon?: string
}) {
  const mark = icon || (danger ? 'trash-2' : '')
  return (
    <button
      type="button"
      className={[
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-line',
        danger ? 'text-red-bright' : 'text-ink',
      ].join(' ')}
      onClick={onClick}
    >
      {mark ? <AppIcon id={mark} size={14} /> : null}
      <span>{label}</span>
    </button>
  )
}
