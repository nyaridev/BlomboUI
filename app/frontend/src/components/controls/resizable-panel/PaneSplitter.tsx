import { PrimitiveResizablePanel } from '@/components/primitives/PrimitiveResizablePanel.tsx'
import { type RefObject } from 'react'

export function PaneSplitter({
  value,
  onChange,
  onReset,
  min,
  containerRef,
  maxRatio = 0.45,
}: {
  value: number
  onChange: (value: number) => void
  onReset?: () => void
  min: number
  containerRef: RefObject<HTMLElement | null>
  maxRatio?: number
}) {
  return (
    <PrimitiveResizablePanel
      value={value}
      onChange={onChange}
      onReset={onReset}
      min={min}
      containerRef={containerRef}
      maxRatio={maxRatio}
      title={onReset ? 'Drag to resize. Double-click to reset.' : 'Drag to resize'}
      className="group flex w-2 shrink-0 cursor-col-resize items-stretch justify-center select-none"
    >
      <span className="w-px bg-line group-hover:bg-ink" />
    </PrimitiveResizablePanel>
  )
}
