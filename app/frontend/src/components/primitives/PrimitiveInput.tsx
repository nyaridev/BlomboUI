import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export const PrimitiveInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function PrimitiveInput(
  props,
  ref,
) {
  return <input ref={ref} {...props} />
})

export const PrimitiveTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function PrimitiveTextarea(props, ref) {
    return <textarea ref={ref} {...props} />
  },
)
