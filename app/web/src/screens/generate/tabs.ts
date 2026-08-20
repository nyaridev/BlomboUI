export const GENERATE_TABS = ['Generation', 'Base Model', 'Lora', 'Wildcards'] as const

export type GenerateTab = (typeof GENERATE_TABS)[number]

export const HIDEABLE_GENERATE_TABS = GENERATE_TABS.filter(
  (item): item is Exclude<GenerateTab, 'Generation'> => item !== 'Generation',
)

export function generateTabOrderList(order: readonly string[]): GenerateTab[] {
  const allowed = new Set<GenerateTab>(GENERATE_TABS)
  const seen = new Set<GenerateTab>()
  const out: GenerateTab[] = []
  for (const item of order) {
    const name = (item === 'Checkpoints' ? 'Base Model' : item) as GenerateTab
    if (allowed.has(name) && !seen.has(name)) {
      out.push(name)
      seen.add(name)
    }
  }
  for (const item of GENERATE_TABS) {
    if (!seen.has(item)) {
      out.push(item)
    }
  }
  return out
}

export function orderedGenerateTabs(order: readonly string[], hidden: readonly string[] = []): GenerateTab[] {
  return generateTabOrderList(order).filter((item) => item === 'Generation' || !hidden.includes(item))
}
