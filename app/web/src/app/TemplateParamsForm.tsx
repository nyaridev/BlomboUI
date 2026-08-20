import { OutputPathOverride } from '@/screens/generate/OutputPathOverride.tsx'
import { NumberField } from '@/components/NumberField.tsx'
import { SelectField } from '@/components/SelectField.tsx'
import { CheckpointField } from '@/components/CheckpointField.tsx'
import { usePromptWeightKey } from '@/lib/promptWeight.ts'
import { type TemplateParams, SEED_AFTER, type SeedAfter } from '@/stores/generateStore.ts'
import { ASPECTS, SAMPLERS, SCHEDULERS, listedChoices } from '@/screens/generate/resolutions.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'

function Label({ children }: { children: string }) {
  return <span className="text-xs text-muted">{children}</span>
}

function fieldClass() {
  return 'w-full rounded border border-line bg-field px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent'
}

type TemplateParamsFormProps = {
  value: TemplateParams
  onChange: (value: TemplateParams) => void
  apply: string[]
}

function off(apply: string[], id: string) {
  return apply.includes(id) ? '' : 'opacity-50'
}

export function TemplateParamsForm({ value, onChange, apply }: TemplateParamsFormProps) {
  const hiddenSamplers = useSettingsStore((s) => s.hiddenSamplers)
  const hiddenSchedulers = useSettingsStore((s) => s.hiddenSchedulers)
  const onPromptKey = usePromptWeightKey((prompt) => onChange({ ...value, prompt }))
  const onNegativeKey = usePromptWeightKey((negativePrompt) => onChange({ ...value, negativePrompt }))
  function set<K extends keyof TemplateParams>(key: K, next: TemplateParams[K]) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={off(apply, 'checkpoint')}>
        <CheckpointField value={value.checkpoint} onChange={(checkpoint) => set('checkpoint', checkpoint)} />
      </div>
      <label className={['flex flex-col gap-1', off(apply, 'prompt')].join(' ')}>
        <Label>Prompt</Label>
        <textarea
          className={fieldClass()}
          rows={3}
          value={value.prompt}
          onChange={(e) => set('prompt', e.target.value)}
          onKeyDown={onPromptKey}
        />
      </label>
      <label className={['flex flex-col gap-1', off(apply, 'negativePrompt')].join(' ')}>
        <Label>Negative</Label>
        <textarea
          className={`${fieldClass()} disabled:cursor-not-allowed`}
          rows={2}
          value={value.negativePrompt}
          onChange={(e) => set('negativePrompt', e.target.value)}
          onKeyDown={onNegativeKey}
          disabled={value.cfg <= 1}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <div className={['flex min-w-0 flex-col gap-1', off(apply, 'sampler')].join(' ')}>
          <Label>Sampler</Label>
          <SelectField
            value={value.sampler}
            onChange={(sampler) => set('sampler', sampler)}
            options={listedChoices(SAMPLERS, hiddenSamplers, value.sampler)}
          />
        </div>
        <div className={['flex min-w-0 flex-col gap-1', off(apply, 'scheduler')].join(' ')}>
          <Label>Scheduler</Label>
          <SelectField
            value={value.scheduler}
            onChange={(scheduler) => set('scheduler', scheduler)}
            options={listedChoices(SCHEDULERS, hiddenSchedulers, value.scheduler)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={['flex min-w-0 flex-col gap-1', off(apply, 'steps')].join(' ')}>
          <Label>Steps</Label>
          <NumberField value={value.steps} onChange={(steps) => set('steps', steps)} min={1} max={150} />
        </label>
        <label className={['flex min-w-0 flex-col gap-1', off(apply, 'cfg')].join(' ')}>
          <Label>CFG</Label>
          <NumberField value={value.cfg} onChange={(cfg) => set('cfg', Math.max(1, cfg))} min={1} max={30} step={0.5} />
        </label>
      </div>
      <div className={['flex items-end gap-2', off(apply, 'seed')].join(' ')}>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <Label>Seed</Label>
          <NumberField value={value.seed} onChange={(seed) => set('seed', seed)} />
        </label>
        <div className="flex w-32 shrink-0 flex-col gap-1">
          <Label>After generation</Label>
          <SelectField
            value={value.seedAfter}
            onChange={(mode) => {
              const seedAfter = mode as SeedAfter
              onChange({ ...value, seedAfter, seed: seedAfter === 'randomize' ? -1 : value.seed })
            }}
            options={[...SEED_AFTER]}
          />
        </div>
      </div>
      <div className={['flex flex-col gap-2', off(apply, 'resolution')].join(' ')}>
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
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={['flex min-w-0 flex-col gap-1', off(apply, 'batchCount')].join(' ')}>
          <Label>Batch count</Label>
          <NumberField value={value.batchCount} onChange={(batchCount) => set('batchCount', batchCount)} min={1} max={100} />
        </label>
        <label className={['flex min-w-0 flex-col gap-1', off(apply, 'batchSize')].join(' ')}>
          <Label>Batch size</Label>
          <NumberField value={value.batchSize} onChange={(batchSize) => set('batchSize', batchSize)} min={1} max={8} />
        </label>
      </div>
      <div className={off(apply, 'outputPath')}>
        <OutputPathOverride
          imagePath={value.outputImagePath}
          gridPath={value.outputGridPath}
          imageName={value.outputImageName}
          gridName={value.outputGridName}
          onImagePath={(outputImagePath) => set('outputImagePath', outputImagePath)}
          onGridPath={(outputGridPath) => set('outputGridPath', outputGridPath)}
          onImageName={(outputImageName) => set('outputImageName', outputImageName)}
          onGridName={(outputGridName) => set('outputGridName', outputGridName)}
        />
      </div>
    </div>
  )
}
