import { FloatingModelsView } from '@/components/composites/models/FloatingModelsView.tsx'
import { LoraStrengthSlider } from '@/components/controls/slider/LoraStrengthSlider.tsx'
import { CheckboxControl } from '@/components/controls/toggle/CheckboxControl.tsx'
import { formatLoraStrength, loraNameMatches, parseLoraHits, removeLoraAt, replaceLoraAt, setLoraStrengthAt, toggleLoraPrompts } from '@/lib/prompt/loraTags.ts'
import { parseWildcardTags, removeWildcardAt, replaceWildcardAt, reorderWildcardTags, toggleWildcard, wildcardMatches } from '@/lib/prompt/wildcardTags.ts'
import { modelThumbSrc } from '@/lib/gallery/thumbView.ts'
import type { ModelLists } from '@/lib/api.ts'
import { toggleSkip } from '@/components/composites/templates/templateApply.ts'
import { autoLoraId, promptLoraId, useGenerateStore, type TemplateParams } from '@/stores/generateStore.ts'
import { modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { galleryPackKey } from '@/stores/settings/constants.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { ModelTile } from '@/views/generate/panels/chrome/sections/tiles/ModelTile.tsx'
import { RowLabel } from '@/views/generate/panels/chrome/sections/tiles/modelTileParts.tsx'
import { modelTileSpec } from '@/views/generate/panels/chrome/sections/tiles/modelLayouts.ts'
import { displayName } from '@/views/generate/panels/chrome/sections/tiles/modelTileUtils.ts'
import { useRef, useState, type ReactNode } from 'react'
import { useTileReorder, type TileDragProps } from '@/views/generate/panels/chrome/sections/tiles/useTileReorder.ts'

export function ApplyRow({
  id,
  apply,
  onToggle,
  locked,
  flush = false,
  children,
}: {
  id: string
  apply: string[]
  onToggle: (id: string) => void
  locked?: boolean
  flush?: boolean
  children: ReactNode
}) {
  const on = apply.includes(id)
  return (
    <div
      className={[
        'flex gap-cluster',
        flush ? 'items-start' : 'items-center rounded-md border border-line bg-panel p-2.5',
      ].join(' ')}
    >
      <div className={['min-w-0 flex-1', on ? '' : 'opacity-50', locked ? 'pointer-events-none' : ''].join(' ')}>{children}</div>
      <div className="flex shrink-0 items-center">
        <CheckboxControl checked={on} onChange={() => onToggle(id)} />
      </div>
    </div>
  )
}

function Slot({
  label,
  showLabel,
  width,
  children,
}: {
  label: string
  showLabel: boolean
  width: string
  children: ReactNode
}) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <RowLabel show={showLabel} width={width} title={label}>
        {label}
      </RowLabel>
      {children}
    </div>
  )
}

function Group({
  label,
  showLabel,
  gap,
  children,
}: {
  label: string
  showLabel: boolean
  gap: string
  children: ReactNode
}) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <RowLabel show={showLabel}>{label}</RowLabel>
      <div className={['flex', gap].join(' ')}>{children}</div>
    </div>
  )
}

function TemplateCard({
  kind,
  role,
  value,
  name,
  src,
  empty = false,
  unresolved = false,
  dimmed = false,
  locked = false,
  badge,
  chromeKey,
  onToggle,
  onChange,
  onClear,
  strengthControl,
  showStrengthControl,
  selected,
  closeOnSelect = true,
  drag,
}: {
  kind: keyof ModelLists
  role: string
  value: string
  name: string
  src?: string | null
  empty?: boolean
  unresolved?: boolean
  dimmed?: boolean
  locked?: boolean
  badge?: string
  chromeKey: string
  onToggle?: () => void
  onChange: (path: string) => void
  onClear?: () => void
  strengthControl?: ReactNode
  showStrengthControl?: boolean
  selected?: string[]
  closeOnSelect?: boolean
  drag?: TileDragProps
}) {
  const style = useGenerateStore((s) => s.modelTileStyle)
  const box = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  function showPicker() {
    if (locked) {
      return
    }
    const rect = box.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    setAnchor(rect)
    setOpen(true)
  }

  return (
    <>
      <div ref={box}>
        <ModelTile
          style={style}
          role={role}
          name={name}
          src={src}
          empty={empty}
          unresolved={unresolved}
          badge={badge}
          dimmed={dimmed}
          onOpen={() => {
            if (empty || !onToggle) {
              showPicker()
              return
            }
            onToggle()
          }}
          onEdit={locked || empty ? undefined : showPicker}
          onClear={locked || empty ? undefined : onClear}
          strengthControl={strengthControl}
          showStrengthControl={showStrengthControl}
          {...(empty || !drag ? {} : drag)}
        />
      </div>
      {open && anchor ? (
        <FloatingModelsView
          kind={kind}
          value={value}
          chromeKey={chromeKey}
          selected={selected}
          closeOnSelect={closeOnSelect}
          anchor={anchor}
          onSelect={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

export function TemplateModelFields({
  value,
  onChange,
  apply,
  onToggle,
  locked = false,
  workflowParams,
}: {
  value: TemplateParams
  onChange: (value: TemplateParams) => void
  apply: string[]
  onToggle: (id: string) => void
  locked?: boolean
  workflowParams: string[]
}) {
  const showCheckpoint = !workflowParams.length || workflowParams.includes('checkpoint')
  const showVae = workflowParams.includes('vae')
  const showTe = workflowParams.includes('textEncoder')
  const showLoras = workflowParams.includes('loras')
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const vaes = useModelsStore((s) => s.vae)
  const textEncoders = useModelsStore((s) => s.text_encoders)
  const loras = useModelsStore((s) => s.loras)
  const wildcards = useModelsStore((s) => s.wildcards)
  const autoDefault = useSettingsStore((s) => s.loraAutoApply)
  const loraStrengthMin = useSettingsStore((s) => s.loraStrengthMin)
  const loraStrengthMax = useSettingsStore((s) => s.loraStrengthMax)
  const loraSliderMin = useSettingsStore((s) => s.loraSliderMin)
  const loraSliderMax = useSettingsStore((s) => s.loraSliderMax)
  const hits = parseLoraHits(value.prompt)
  const wildHits = parseWildcardTags(value.prompt)
  const autoPrefix = autoLoraId('')
  const autoIds = value.activeLoraOrder.filter((id) => id.startsWith(autoPrefix))
  const takenLoras = [
    ...autoIds.map((id) => id.slice(autoPrefix.length)),
    ...hits.map((hit) => loras.find((row) => loraNameMatches(hit.name, row.path))?.path ?? ''),
  ].filter(Boolean)
  const tileStyle = useGenerateStore((s) => s.modelTileStyle)
  const spec = modelTileSpec(tileStyle)
  const [showStrength, setShowStrength] = useState(false)
  const ckptKey = galleryPackKey('template-checkpoints')
  const teKey = galleryPackKey('template-text-encoders')
  const vaeKey = galleryPackKey('template-vae')
  const loraKey = galleryPackKey('template-loras')
  const wildKey = galleryPackKey('template-wildcards')
  const ckptView = useThumbView('checkpoints', ckptKey)
  const teView = useThumbView('text_encoders', teKey)
  const vaeView = useThumbView('vae', vaeKey)
  const loraView = useThumbView('loras', loraKey)
  const wildView = useThumbView('wildcards', wildKey)

  function patch(next: Partial<TemplateParams>) {
    if (locked) {
      return
    }
    onChange({ ...value, ...next })
  }

  function addLora(path: string) {
    const item = loras.find((row) => row.path === path)
    const instant = Boolean(item?.auto_apply ?? autoDefault)
    const id = autoLoraId(path)
    if (instant) {
      const on = value.activeLoraOrder.includes(id)
      patch({
        activeLoraOrder: on ? value.activeLoraOrder.filter((entry) => entry !== id) : [...value.activeLoraOrder, id],
        activeLoraStrengths: {
          ...value.activeLoraStrengths,
          [path]: value.activeLoraStrengths[path] ?? item?.strength ?? 1,
        },
        skippedLoras: value.skippedLoras.filter((entry) => entry !== id),
      })
      return
    }
    const next = toggleLoraPrompts(
      value.prompt,
      value.negativePrompt,
      path,
      item?.prompt || '',
      item?.negative_prompt || '',
      item?.strength ?? 1,
    )
    patch({
      prompt: next.prompt,
      negativePrompt: next.negativePrompt,
    })
  }

  function replaceAuto(oldPath: string, path: string) {
    const oldId = autoLoraId(oldPath)
    const item = loras.find((row) => row.path === path)
    const instant = Boolean(item?.auto_apply ?? autoDefault)
    const order = value.activeLoraOrder.filter((id) => id !== oldId)
    const skipped = value.skippedLoras.filter((id) => id !== oldId)
    if (instant) {
      const id = autoLoraId(path)
      patch({
        activeLoraOrder: order.includes(id) ? order : [...order, id],
        activeLoraStrengths: { ...value.activeLoraStrengths, [path]: value.activeLoraStrengths[path] ?? item?.strength ?? 1 },
        skippedLoras: skipped,
      })
      return
    }
    const next = toggleLoraPrompts(
      value.prompt,
      value.negativePrompt,
      path,
      item?.prompt || '',
      item?.negative_prompt || '',
      item?.strength ?? 1,
    )
    patch({ prompt: next.prompt, negativePrompt: next.negativePrompt, activeLoraOrder: order, skippedLoras: skipped })
  }

  function replacePromptLora(index: number, path: string) {
    const hit = hits[index]
    const old = hit ? loras.find((row) => loraNameMatches(hit.name, row.path)) : null
    const item = loras.find((row) => row.path === path)
    const instant = Boolean(item?.auto_apply ?? autoDefault)
    if (instant) {
      const next = removeLoraAt(value.prompt, value.negativePrompt, index, old?.prompt || '')
      const id = autoLoraId(path)
      patch({
        prompt: next.prompt,
        negativePrompt: next.negativePrompt,
        activeLoraOrder: value.activeLoraOrder.includes(id) ? value.activeLoraOrder : [...value.activeLoraOrder, id],
        activeLoraStrengths: { ...value.activeLoraStrengths, [path]: value.activeLoraStrengths[path] ?? item?.strength ?? 1 },
      })
      return
    }
    const next = replaceLoraAt(
      value.prompt,
      value.negativePrompt,
      index,
      path,
      item?.prompt || '',
      item?.negative_prompt || '',
      hit?.strength ?? item?.strength ?? 1,
      old?.prompt || '',
      old?.negative_prompt || '',
    )
    patch({ prompt: next.prompt, negativePrompt: next.negativePrompt })
  }

  const promptRefs = hits.map((hit, index) => {
    const item = loras.find((row) => loraNameMatches(hit.name, row.path)) ?? null
    return {
      id: promptLoraId(item ? modelPath(item) : hit.name, hit.start),
      mode: 'prompt' as const,
      path: item ? modelPath(item) : hit.name,
      index,
      hit,
      item,
    }
  })
  const autoRefs = autoIds.map((id) => {
    const path = id.slice(autoPrefix.length)
    const item = loras.find((row) => row.path === path) ?? null
    return { id, mode: 'auto' as const, path, index: -1, hit: null, item }
  })
  const availableRefs = [...autoRefs, ...promptRefs]
  const availableIds = new Set(availableRefs.map((ref) => ref.id))
  const normalizedOrder = [
    ...value.activeLoraOrder.filter((id) => availableIds.has(id)),
    ...availableRefs.map((ref) => ref.id).filter((id) => !value.activeLoraOrder.includes(id)),
  ]
  const orderedRefs = normalizedOrder.flatMap((id) => {
    const ref = availableRefs.find((item) => item.id === id)
    return ref ? [ref] : []
  })
  const { dragProps: loraDrag } = useTileReorder(normalizedOrder, (activeLoraOrder) => patch({ activeLoraOrder }))
  const wildIds = wildHits.map((_, index) => String(index))
  const { dragProps: wildDrag } = useTileReorder(wildIds, (next) => {
    patch({ prompt: reorderWildcardTags(value.prompt, next.map(Number)) })
  })

  return (
    <div
      className="min-w-0 overflow-x-auto"
      onMouseEnter={() => setShowStrength(true)}
      onMouseLeave={() => setShowStrength(false)}
    >
      <div className={['flex w-max items-start py-0.5', spec.gap].join(' ')}>
        {showCheckpoint ? (
          <Slot label="Checkpoint" showLabel={spec.overlay} width={spec.width}>
            <TemplateCard
              kind="checkpoints"
              role="Checkpoint"
              value={value.checkpoint}
              name={displayName(checkpoints.find((row) => modelPath(row) === value.checkpoint) ?? null, value.checkpoint || 'Checkpoint')}
              src={modelThumbSrc('checkpoints', checkpoints.find((row) => modelPath(row) === value.checkpoint) ?? null, ckptView)}
              empty={!value.checkpoint.trim()}
              unresolved={Boolean(value.checkpoint) && !checkpoints.some((row) => modelPath(row) === value.checkpoint)}
              dimmed={Boolean(value.checkpoint.trim()) && !apply.includes('checkpoint')}
              locked={locked}
              chromeKey="template-checkpoints"
              onToggle={() => onToggle('checkpoint')}
              onChange={(checkpoint) => patch({ checkpoint })}
              onClear={() => patch({ checkpoint: '' })}
            />
          </Slot>
        ) : null}
        {showTe ? (
          <Slot label="Text encoder" showLabel={spec.overlay} width={spec.width}>
            <TemplateCard
              kind="text_encoders"
              role="Text encoder"
              value={value.textEncoder}
              name={displayName(textEncoders.find((row) => modelPath(row) === value.textEncoder) ?? null, value.textEncoder || 'Text encoder')}
              src={modelThumbSrc('text_encoders', textEncoders.find((row) => modelPath(row) === value.textEncoder) ?? null, teView)}
              empty={!value.textEncoder.trim()}
              unresolved={Boolean(value.textEncoder) && !textEncoders.some((row) => modelPath(row) === value.textEncoder)}
              dimmed={Boolean(value.textEncoder.trim()) && !apply.includes('textEncoder')}
              locked={locked}
              chromeKey="template-text-encoders"
              onToggle={() => onToggle('textEncoder')}
              onChange={(textEncoder) => patch({ textEncoder })}
              onClear={() => patch({ textEncoder: '' })}
            />
          </Slot>
        ) : null}
        {showVae ? (
          <Slot label="VAE" showLabel={spec.overlay} width={spec.width}>
            <TemplateCard
              kind="vae"
              role="VAE"
              value={value.vae}
              name={displayName(vaes.find((row) => modelPath(row) === value.vae) ?? null, value.vae || 'VAE')}
              src={modelThumbSrc('vae', vaes.find((row) => modelPath(row) === value.vae) ?? null, vaeView)}
              empty={!value.vae.trim()}
              unresolved={Boolean(value.vae) && !vaes.some((row) => modelPath(row) === value.vae)}
              dimmed={Boolean(value.vae.trim()) && !apply.includes('vae')}
              locked={locked}
              chromeKey="template-vae"
              onToggle={() => onToggle('vae')}
              onChange={(vae) => patch({ vae })}
              onClear={() => patch({ vae: '' })}
            />
          </Slot>
        ) : null}
        {showLoras ? (
          <>
            {showCheckpoint || showVae || showTe ? <span className="mx-1 w-px shrink-0 self-stretch bg-line" /> : null}
            <Group label="LoRa" showLabel={spec.overlay} gap={spec.gap}>
              {orderedRefs.map((ref) => {
                const strength =
                  ref.mode === 'auto'
                    ? value.activeLoraStrengths[ref.path] ?? ref.item?.strength ?? 1
                    : ref.hit?.strength ?? 1
                const rangeMin = ref.item?.slider ? loraSliderMin : loraStrengthMin
                const rangeMax = ref.item?.slider ? loraSliderMax : loraStrengthMax
                const drag = locked ? undefined : loraDrag(ref.id)
                if (ref.mode === 'auto') {
                  return (
                    <TemplateCard
                      key={ref.id}
                      kind="loras"
                      role="LoRA"
                      value={ref.path}
                      name={displayName(ref.item, ref.path)}
                      src={modelThumbSrc('loras', ref.item, loraView)}
                      unresolved={!ref.item}
                      dimmed={value.skippedLoras.includes(ref.id)}
                      locked={locked}
                      badge={formatLoraStrength(strength)}
                      chromeKey="template-loras"
                      showStrengthControl={showStrength}
                      drag={drag}
                      strengthControl={
                        <LoraStrengthSlider
                          label={displayName(ref.item, ref.path)}
                          value={strength}
                          min={rangeMin}
                          max={rangeMax}
                          onChange={(next) =>
                            patch({ activeLoraStrengths: { ...value.activeLoraStrengths, [ref.path]: next } })
                          }
                        />
                      }
                      onToggle={() => patch({ skippedLoras: toggleSkip(value.skippedLoras, ref.id) })}
                      onChange={(next) => replaceAuto(ref.path, next)}
                      onClear={() =>
                        patch({
                          activeLoraOrder: value.activeLoraOrder.filter((entry) => entry !== ref.id),
                          skippedLoras: value.skippedLoras.filter((entry) => entry !== ref.id),
                        })
                      }
                    />
                  )
                }
                return (
                  <TemplateCard
                    key={ref.id}
                    kind="loras"
                    role="LoRA"
                    value={ref.path}
                    name={displayName(ref.item, ref.hit?.name || ref.path)}
                    src={modelThumbSrc('loras', ref.item, loraView)}
                    unresolved={!ref.item}
                    locked={locked}
                    badge={ref.hit?.invalid ? ref.hit.raw.trim() || '?' : formatLoraStrength(ref.hit?.strength ?? 1)}
                    chromeKey="template-loras"
                    showStrengthControl={showStrength}
                    drag={drag}
                    strengthControl={
                      <LoraStrengthSlider
                        label={displayName(ref.item, ref.hit?.name || ref.path)}
                        value={ref.hit?.strength ?? 1}
                        min={rangeMin}
                        max={rangeMax}
                        onChange={(next) => patch({ prompt: setLoraStrengthAt(value.prompt, ref.index, next) })}
                      />
                    }
                    onChange={(path) => replacePromptLora(ref.index, path)}
                    onClear={() => {
                      const next = removeLoraAt(value.prompt, value.negativePrompt, ref.index, ref.item?.prompt || '')
                      patch({ prompt: next.prompt, negativePrompt: next.negativePrompt })
                    }}
                  />
                )
              })}
              <TemplateCard
                kind="loras"
                role="LoRA"
                value=""
                name="LoRA"
                empty
                locked={locked}
                chromeKey="template-loras"
                selected={takenLoras}
                closeOnSelect={false}
                onChange={addLora}
              />
            </Group>
          </>
        ) : null}
        {showCheckpoint || showVae || showTe || showLoras ? <span className="mx-1 w-px shrink-0 self-stretch bg-line" /> : null}
        <Group label="Wildcards" showLabel={spec.overlay} gap={spec.gap}>
          {wildHits.map((hit, index) => {
            const item = wildcards.find((row) => wildcardMatches(row, hit.name)) ?? null
            return (
              <TemplateCard
                key={`wild-${index}-${hit.name}`}
                kind="wildcards"
                role="Wildcard"
                value={item ? modelPath(item) : hit.name}
                name={displayName(item, hit.name)}
                src={modelThumbSrc('wildcards', item, wildView)}
                unresolved={!item}
                locked={locked}
                chromeKey="template-wildcards"
                drag={locked ? undefined : wildDrag(String(index))}
                onChange={(path) => {
                  const next = wildcards.find((row) => row.path === path)
                  if (next) {
                    patch({ prompt: replaceWildcardAt(value.prompt, index, next) })
                  }
                }}
                onClear={() => patch({ prompt: removeWildcardAt(value.prompt, index) })}
              />
            )
          })}
          <TemplateCard
            kind="wildcards"
            role="Wildcard"
            value=""
            name="Wildcard"
            empty
            locked={locked}
            chromeKey="template-wildcards"
            onChange={(path) => {
              const item = wildcards.find((row) => row.path === path)
              if (item) {
                patch({ prompt: toggleWildcard(value.prompt, item) })
              }
            }}
          />
        </Group>
      </div>
    </div>
  )
}
