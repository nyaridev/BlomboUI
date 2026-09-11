import { ResizeGrip } from '@/components/controls/resizable-panel/ResizeGrip.tsx'
import { fitContentHeight } from '@/components/controls/textarea/fitContentHeight.ts'
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

  const applied = height ?? defaultHeight

  return (
    <div className="relative flex min-w-0 flex-col" style={applied == null ? undefined : { height: applied }}>
      <PrimitiveTextarea
        {...props}
        ref={textarea}
        className={['block h-full w-full resize-none', className].filter(Boolean).join(' ')}
        style={{ ...style, ...(applied == null ? {} : { height: '100%' }) }}
      />
      <ResizeGrip
        value={applied ?? minHeight}
        onChange={setHeight}
        onReset={() => {
          const el = textarea.current
          if (!el || defaultHeight == null) {
            setHeight(null)
            return
          }
          const next = fitContentHeight(el, defaultHeight, minHeight, maxHeight)
          setHeight(next <= defaultHeight ? null : next)
        }}
        min={minHeight}
        max={maxHeight}
      />
    </div>
  )
}
