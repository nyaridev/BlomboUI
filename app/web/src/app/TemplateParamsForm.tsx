import { NumberField } from '@/components/NumberField.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { CheckpointField } from '@/components/CheckpointField.tsx'
import { type TemplateParams } from '@/stores/generateStore.ts'
import { ASPECTS, SAMPLERS, SCHEDULERS } from '@/screens/generate/resolutions.ts'

function Label({ children }: { children: string }) {
  return <span className="text-xs text-muted">{children}</span>
}

function fieldClass() {
  return 'w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'
}

type TemplateParamsFormProps = {
  value: TemplateParams
  onChange: (value: TemplateParams) => void
}

export function TemplateParamsForm({ value, onChange }: TemplateParamsFormProps) {
  function set<K extends keyof TemplateParams>(key: K, next: TemplateParams[K]) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="flex flex-col gap-2">
      <CheckpointField value={value.checkpoint} onChange={(checkpoint) => set('checkpoint', checkpoint)} />
      <label className="flex flex-col gap-1">
        <Label>Prompt</Label>
        <textarea className={fieldClass()} rows={3} value={value.prompt} onChange={(e) => set('prompt', e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <Label>Negative</Label>
        <textarea
          className={`${fieldClass()} disabled:cursor-not-allowed`}
          rows={2}
          value={value.negativePrompt}
          onChange={(e) => set('negativePrompt', e.target.value)}
          disabled={value.cfg <= 1}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Label>Sampler</Label>
          <SelectField
            value={value.sampler}
            onChange={(sampler) => set('sampler', sampler)}
            options={[...new Set([value.sampler, ...SAMPLERS])]}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label>Scheduler</Label>
          <SelectField
            value={value.scheduler}
            onChange={(scheduler) => set('scheduler', scheduler)}
            options={[...new Set([value.scheduler, ...SCHEDULERS])]}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex min-w-0 flex-col gap-1">
          <Label>Steps</Label>
          <NumberField value={value.steps} onChange={(steps) => set('steps', steps)} min={1} max={150} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <Label>CFG</Label>
          <NumberField value={value.cfg} onChange={(cfg) => set('cfg', Math.max(1, cfg))} min={1} max={30} step={0.5} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <Label>Seed</Label>
          <NumberField value={value.seed} onChange={(seed) => set('seed', seed)} />
        </label>
      </div>
      <div className="inline-flex self-start rounded border border-line text-xs">
        <button
          type="button"
          className={['rounded-l px-2 py-1', value.resMode === 'raw' ? 'bg-line text-ink' : 'text-muted hover:text-ink'].join(' ')}
          onClick={() => set('resMode', 'raw')}
        >
          Raw
        </button>
        <button
          type="button"
          className={['rounded-r px-2 py-1', value.resMode === 'scaler' ? 'bg-line text-ink' : 'text-muted hover:text-ink'].join(' ')}
          onClick={() => set('resMode', 'scaler')}
        >
          Scaler
        </button>
      </div>
      {value.resMode === 'raw' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1">
            <Label>Width</Label>
            <NumberField value={value.width} onChange={(width) => set('width', width)} min={64} max={4096} step={8} />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <Label>Height</Label>
            <NumberField value={value.height} onChange={(height) => set('height', height)} min={64} max={4096} step={8} />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <Label>Aspect</Label>
            <SelectField
              value={value.aspect}
              onChange={(aspect) => set('aspect', aspect)}
              options={ASPECTS.map((item) => ({ value: item.id, label: item.label }))}
            />
          </div>
          <label className="flex min-w-0 flex-col gap-1">
            <Label>Megapixels</Label>
            <NumberField
              value={value.megapixels}
              onChange={(megapixels) => set('megapixels', megapixels)}
              min={0.2}
              max={4}
              step={0.05}
            />
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1">
          <Label>Batch count</Label>
          <NumberField value={value.batchCount} onChange={(batchCount) => set('batchCount', batchCount)} min={1} max={100} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <Label>Batch size</Label>
          <NumberField value={value.batchSize} onChange={(batchSize) => set('batchSize', batchSize)} min={1} max={8} />
        </label>
      </div>
    </div>
  )
}
