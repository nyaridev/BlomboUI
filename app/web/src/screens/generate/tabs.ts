export const GENERATE_TABS = ['Generation', 'Base Model', 'Lora', 'Wildcards'] as const

export type GenerateTab = (typeof GENERATE_TABS)[number]

export const HIDEABLE_GENERATE_TABS = GENERATE_TABS.filter(
  (item): item is Exclude<GenerateTab, 'Generation'> => item !== 'Generation',
)
