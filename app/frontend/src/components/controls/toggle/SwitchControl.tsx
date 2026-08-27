import { PrimitiveSwitch, PrimitiveSwitchThumb } from '@/components/primitives/PrimitiveToggle.tsx'

export function SwitchControl({
  checked,
  onChange,
  disabled,
}: {
  checked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <PrimitiveSwitch
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
      className="relative h-5 w-9 shrink-0 rounded-full border border-track bg-field disabled:opacity-40 data-[state=checked]:border-accent data-[state=checked]:bg-accent"
    >
      <PrimitiveSwitchThumb className="block size-4 translate-x-0.5 rounded-full bg-thumb transition-transform data-[state=checked]:translate-x-[1.125rem]" />
    </PrimitiveSwitch>
  )
}
