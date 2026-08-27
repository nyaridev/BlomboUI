import { PrimitiveCheckbox } from '@/components/primitives/PrimitiveToggle.tsx'

export function CheckboxControl({
  checked,
  defaultChecked,
  onChange,
  disabled,
  className = '',
}: {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <PrimitiveCheckbox
      className={['check', className].filter(Boolean).join(' ')}
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      onCheckedChange={(value) => onChange?.(value === true)}
    />
  )
}
