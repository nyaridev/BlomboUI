export type SelectOption = { value: string; label: string; badge?: string }

export function toOptions(options: string[] | SelectOption[]): SelectOption[] {
  return options.map((item) => (typeof item === 'string' ? { value: item, label: item } : item))
}

export function matches(value: string, query: string, label?: (value: string) => string) {
  if (!query) {
    return true
  }
  const q = query.toLowerCase()
  return value.toLowerCase().includes(q) || (label?.(value) || '').toLowerCase().includes(q)
}

export function matchesOption(item: SelectOption, query: string) {
  return matches(item.label, query) || item.value.toLowerCase().includes(query.toLowerCase())
}

export function sameOption(item: SelectOption, text: string) {
  const q = text.toLowerCase()
  return item.label.toLowerCase() === q || item.value.toLowerCase() === q
}

export function wrap(index: number, count: number, delta: number) {
  if (count <= 0) {
    return 0
  }
  return (index + delta + count) % count
}
