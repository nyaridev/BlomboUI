import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { getFrequentPromptTags, type FrequentPromptTag } from '@/lib/api.ts'
import { toast } from '@/stores/toastStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { SettingsCard } from './SettingsBlock.tsx'
import { useEffect, useState } from 'react'

export const FREQUENT_TAGS_QUERY = 'frequent tags autocomplete favorites star usage count prompt'

export function FrequentTagsPanel({ query = '' }: { query?: string }) {
  const frequentTagsEnabled = useSettingsStore((s) => s.frequentTagsEnabled)
  const [tags, setTags] = useState<FrequentPromptTag[]>([])
  const [threshold, setThreshold] = useState(2)

  useEffect(() => {
    void getFrequentPromptTags()
      .then((data) => {
        setTags(data.tags)
        setThreshold(data.threshold)
      })
      .catch((err) => toast(err instanceof Error ? err.message : 'Could not load frequent tags', 'error'))
  }, [])

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <SettingsCard query={query} title="Frequent Tags" terms={FREQUENT_TAGS_QUERY}>
        <p className="text-xs text-muted">
          Tags from your prompts after generate. Starred when used at least {threshold} times.
        </p>
        {tags.length === 0 ? (
          <p className="text-xs text-muted">Generate with a prompt to start collecting tags.</p>
        ) : (
          <div className={['flex flex-col divide-y divide-line', frequentTagsEnabled ? '' : 'opacity-40'].join(' ')}>
            {tags.map((item) => (
              <div key={item.tag} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{item.tag}</span>
                <span className="shrink-0 text-xs text-muted">{item.count}</span>
                {item.favorite ? <AppIcon id="star" size={12} className="fill-current text-muted" /> : <span className="w-3" />}
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
    </div>
  )
}
