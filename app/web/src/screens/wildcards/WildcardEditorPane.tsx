import { LineList } from './LineList.tsx'
import { RawEditor } from './RawEditor.tsx'
import { WildcardFileBar } from './WildcardFileBar.tsx'
import { YamlEditor } from './YamlEditor.tsx'
import type { WildcardFile, YamlNode } from '@/lib/api.ts'

export function WildcardEditorPane({
  draft,
  dirty,
  raw,
  busy,
  onRaw,
  onDashboard,
  onReveal,
  onRename,
  onSave,
  onLines,
  onTree,
  onText,
}: {
  draft: WildcardFile | null
  dirty: boolean
  raw: boolean
  busy: boolean
  onRaw: () => void
  onDashboard: () => void
  onReveal: () => void
  onRename: () => void
  onSave: () => void
  onLines: (lines: string[]) => void
  onTree: (tree: Record<string, YamlNode>) => void
  onText: (text: string) => void
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-4">
      <WildcardFileBar
        path={draft?.path ?? null}
        dirty={dirty}
        raw={raw}
        busy={busy}
        onRaw={onRaw}
        onDashboard={onDashboard}
        onReveal={onReveal}
        onRename={onRename}
        onSave={onSave}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-8">
        {!draft ? (
          <p className="text-sm text-muted">Choose a .txt or .yaml file, or use + on a folder to add one.</p>
        ) : raw || (draft.format === 'yaml' && (draft.error || !draft.tree)) ? (
          <RawEditor
            key={draft.path}
            value={draft.format === 'txt' ? (draft.lines ?? []).join('\n') : (draft.text ?? '')}
            error={draft.error}
            yaml={draft.format === 'yaml'}
            onChange={(value) => {
              if (draft.format === 'txt') {
                onLines(value.split('\n'))
                return
              }
              onText(value)
            }}
          />
        ) : draft.format === 'txt' ? (
          <LineList value={draft.lines ?? ['']} onChange={onLines} />
        ) : (
          <YamlEditor value={draft.tree ?? {}} onChange={onTree} />
        )}
      </div>
    </div>
  )
}
