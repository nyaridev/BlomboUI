import { SegmentSwitch } from '@/components/controls/button/SegmentSwitch.tsx'
import { SelectField } from '@/components/controls/select/SelectField.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { useHealthStore } from '@/stores/healthStore.ts'
import {
  SAGE_ATTENTION_MODES,
  type AttentionEngine,
} from '@/stores/generateStore.ts'

export function useAttentionCaps() {
  const sage = useHealthStore((s) => s.health?.comfy.sage === true)
  const flash = useHealthStore((s) => s.health?.comfy.flash === true)
  return { sage, flash, any: sage || flash, both: sage && flash }
}

export function AttentionFields({
  engine,
  sageAttention,
  allowCompile,
  onChange,
  locked = false,
}: {
  engine: AttentionEngine
  sageAttention: string
  allowCompile: boolean
  onChange: (next: { engine?: AttentionEngine; sageAttention?: string; allowCompile?: boolean }) => void
  locked?: boolean
}) {
  const { sage, both } = useAttentionCaps()
  const effective: AttentionEngine = both ? engine : sage ? 'sage' : 'flash'

  function set(next: { engine?: AttentionEngine; sageAttention?: string; allowCompile?: boolean }) {
    if (!locked) {
      onChange(next)
    }
  }
  return (
    <div className="flex flex-col gap-stack">
      {both ? (
        <SegmentSwitch
          fill
          disabled={locked}
          value={engine}
          tone="blue"
          options={[
            { id: 'sage', label: 'SageAttention' },
            { id: 'flash', label: 'FlashAttention' },
          ]}
          onChange={(next) => set({ engine: next })}
        />
      ) : null}
      {effective === 'sage' ? (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">Sage attention</span>
          <SelectField
            value={SAGE_ATTENTION_MODES.some((mode) => mode === sageAttention) ? sageAttention : 'auto'}
            onChange={(next) => set({ sageAttention: next })}
            options={[...SAGE_ATTENTION_MODES].map((mode) => ({
              value: mode,
              label: mode === 'auto' ? 'Auto' : mode,
            }))}
          />
        </div>
      ) : null}
      <label className="flex min-w-0 items-center gap-2 text-sm text-ink">
        <CheckboxControl checked={allowCompile} disabled={locked} onChange={(next) => set({ allowCompile: next })} />
        Allow compile
      </label>
    </div>
  )
}
