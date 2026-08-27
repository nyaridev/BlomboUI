import { ResizeGrip } from '@/components/controls/resizable-panel/ResizeGrip.tsx'
import { PrimitiveTextarea } from '@/components/primitives/PrimitiveInput.tsx'
import { useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react'

export function ResizableTextarea({
  className = '',
  style,
  minHeight = 2.5 * 16,
  maxHeight = 48 * 16,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minHeight?: number
  maxHeight?: number
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [defaultHeight, setDefaultHeight] = useState<number | null>(null)
  const [height, setHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (defaultHeight == null && textarea.current) {
      setDefaultHeight(textarea.current.offsetHeight)
    }
  }, [defaultHeight])

  return (
    <div className="relative min-w-0" style={height == null ? undefined : { height }}>
      <PrimitiveTextarea
        {...props}
        ref={textarea}
        className={['h-full w-full resize-none', className].filter(Boolean).join(' ')}
        style={{ ...style, ...(height == null ? {} : { height: '100%' }) }}
      />
      <ResizeGrip
        value={height ?? defaultHeight ?? minHeight}
        onChange={setHeight}
        onReset={() => setHeight(null)}
        min={minHeight}
        max={maxHeight}
      />
    </div>
  )
}
