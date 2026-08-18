import { useRef, useState } from 'react'
import { ChipList } from '@/components/ChipList.tsx'

type ChipInputProps = {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}

export function ChipInput({ value, onChange, placeholder = 'Type and press Enter…' }: ChipInputProps) {
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)

  function commit() {
    const item = draft.trim()
    setDraft('')
    if (!item || value.includes(item)) {
      return
    }
    onChange([...value, item])
  }

  return (
    <div
      className="flex min-h-9 items-start rounded border border-line bg-field px-2 py-1.5 focus-within:border-accent"
      onClick={() => input.current?.focus()}
    >
      <ChipList value={value} onChange={onChange} onChipClick={() => input.current?.focus()}>
        <input
          ref={input}
          className="min-w-16 flex-1 bg-transparent py-0.5 text-sm text-ink outline-none"
          value={draft}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
          }}
          onClick={(event) => event.stopPropagation()}
        />
      </ChipList>
    </div>
  )
}
