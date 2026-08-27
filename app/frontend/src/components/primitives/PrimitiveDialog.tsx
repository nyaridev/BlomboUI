import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

export function PrimitiveDialog({
  onClose,
  children,
  overlayClassName,
  contentClassName,
}: {
  onClose: () => void
  children: ReactNode
  overlayClassName?: string
  contentClassName?: string
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClassName} data-overlay />
        <Dialog.Content
          className={contentClassName}
          aria-describedby={undefined}
          onPointerDownOutside={(event) => {
            if (event.target instanceof Element && event.target.closest('[data-models-picker]')) {
              event.preventDefault()
            }
          }}
          onFocusOutside={(event) => {
            if (event.target instanceof Element && event.target.closest('[data-models-picker]')) {
              event.preventDefault()
            }
          }}
        >
          <Dialog.Title className="sr-only">Dialog</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
