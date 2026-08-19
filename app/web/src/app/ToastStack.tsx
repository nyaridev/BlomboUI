import { ToastCard } from '@/app/ToastCard.tsx'
import { useToastStore } from '@/stores/toastStore.ts'

export function ToastStack() {
  const items = useToastStore((s) => s.items)
  const dismiss = useToastStore((s) => s.dismiss)

  if (!items.length) {
    return null
  }

  return (
    <div className="pointer-events-none fixed top-[6.75rem] right-4 z-40 flex w-72 flex-col gap-2">
      {items.map((item) => (
        <div key={item.id} className={['pointer-events-auto', item.dead ? 'toast-out' : 'toast-in'].join(' ')}>
          <ToastCard text={item.text} tone={item.tone} onClose={() => dismiss(item.id)} />
        </div>
      ))}
    </div>
  )
}
