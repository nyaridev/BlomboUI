import { AppIcon } from '@/components/chrome/AppIcon.tsx'
import { formatLoraStrength, loraNameMatches, parseLoraHits, removeLoraAt, setLoraStrengthAt } from '@/lib/prompt/loraTags.ts'
import { modelTypesMatch } from '@/lib/modelTypes.ts'
import { parseWildcardTags, removeWildcardAt, wildcardMatches } from '@/lib/prompt/wildcardTags.ts'
import {
  autoLoraId,
  promptLoraId,
  reorderActiveLoras,
  sameModelSwap,
  useGenerateStore,
  type ModelSwap,
} from '@/stores/generateStore.ts'
import { modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { LoraStrengthSlider } from './LoraStrengthSlider.tsx'
import { modelTileSpec, type ModelTileStyle } from './modelLayouts.ts'
import { emptyTile, promptTile, RowLabel, slotTile, Tile, type Group } from './modelTileParts.tsx'
import { displayName } from './modelTileUtils.ts'
import { type GenerateTab } from './tabs.ts'

export function ModelTileRow({
  style,
  onOpenTab,
}: {
  style: ModelTileStyle
  onOpenTab: (tab: GenerateTab) => void
}) {
  const prompt = useGenerateStore((s) => s.prompt)
  const negativePrompt = useGenerateStore((s) => s.negativePrompt)
  const setPrompt = useGenerateStore((s) => s.setPrompt)
  const setNegativePrompt = useGenerateStore((s) => s.setNegativePrompt)
  const checkpoint = useGenerateStore((s) => s.checkpoint)
  const setCheckpoint = useGenerateStore((s) => s.setCheckpoint)
  const textEncoder = useGenerateStore((s) => s.textEncoder)
  const setTextEncoder = useGenerateStore((s) => s.setTextEncoder)
  const vae = useGenerateStore((s) => s.vae)
  const setVae = useGenerateStore((s) => s.setVae)
  const swapTarget = useGenerateStore((s) => s.swapTarget)
  const setSwapTarget = useGenerateStore((s) => s.setSwapTarget)
  const setModelTileStyle = useGenerateStore((s) => s.setModelTileStyle)
  const activeLoraOrder = useGenerateStore((s) => s.activeLoraOrder)
  const activeLoraStrengths = useGenerateStore((s) => s.activeLoraStrengths)
  const setActiveLoraOrder = useGenerateStore((s) => s.setActiveLoraOrder)
  const setActiveLoraStrength = useGenerateStore((s) => s.setActiveLoraStrength)
  const toggleAutoLora = useGenerateStore((s) => s.toggleAutoLora)
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const vaes = useModelsStore((s) => s.vae)
  const loras = useModelsStore((s) => s.loras)
  const wildcards = useModelsStore((s) => s.wildcards)
  const loraAutoApplyDefault = useSettingsStore((s) => s.loraAutoApply)
  const loraStrengthMin = useSettingsStore((s) => s.loraStrengthMin)
  const loraStrengthMax = useSettingsStore((s) => s.loraStrengthMax)
  const loraSliderMin = useSettingsStore((s) => s.loraSliderMin)
  const loraSliderMax = useSettingsStore((s) => s.loraSliderMax)
  useThumbView()
  const checkpointItem = checkpoints.find((item) => modelPath(item) === checkpoint)

  useEffect(() => {
    if (!checkpoint || checkpoints.some((item) => modelPath(item) === checkpoint)) {
      return
    }
    const base = checkpoint.split(/[\\/]/).pop()
    const hits = checkpoints.filter((item) => modelPath(item).split(/[\\/]/).pop() === base)
    if (hits.length === 1) {
      setCheckpoint(modelPath(hits[0]))
    }
  }, [checkpoint, checkpoints, setCheckpoint])

  const spec = modelTileSpec(style)
  const loraHits = parseLoraHits(prompt)
  const wildHits = parseWildcardTags(prompt)
  const autoPrefix = autoLoraId('')
  const promptRefs = loraHits.map((hit, index) => {
    const item = loras.find((row) => loraNameMatches(hit.name, row.path)) ?? null
    return {
      id: promptLoraId(item?.path ?? hit.name, hit.start),
      mode: 'prompt' as const,
      path: item?.path ?? hit.name,
      index,
      hit,
      item,
    }
  })
  const autoRefs = activeLoraOrder
    .filter((id) => id.startsWith(autoPrefix))
    .flatMap((id) => {
      const path = id.slice(autoPrefix.length)
      const item = loras.find((row) => row.path === path) ?? null
      if (item && !(item.auto_apply ?? loraAutoApplyDefault)) {
        return []
      }
      return [{
        id,
        mode: 'auto' as const,
        path,
        index: -1,
        hit: null,
        item,
      }]
    })
  const availableRefs = [...autoRefs, ...promptRefs]
  const availableIds = new Set(availableRefs.map((ref) => ref.id))
  const normalizedOrder = [
    ...activeLoraOrder.filter((id) => availableIds.has(id)),
    ...availableRefs.map((ref) => ref.id).filter((id) => !activeLoraOrder.includes(id)),
  ]
  const orderedRefs = normalizedOrder.flatMap((id) => {
    const ref = availableRefs.find((item) => item.id === id)
    return ref ? [ref] : []
  })
  const normalizedOrderKey = normalizedOrder.join('\0')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const draggedLora = useRef<string | null>(null)
  const [draggingLoraId, setDraggingLoraId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null)
  const [showStrengthControls, setShowStrengthControls] = useState(false)
  const normalizedOrderRef = useRef(normalizedOrder)
  normalizedOrderRef.current = normalizedOrder
  const [fade, setFade] = useState({ left: false, right: false })

  useEffect(() => {
    if (normalizedOrderKey !== activeLoraOrder.join('\0')) {
      setActiveLoraOrder(normalizedOrderRef.current)
    }
  }, [activeLoraOrder, normalizedOrderKey, setActiveLoraOrder])

  function endDrag() {
    draggedLora.current = null
    setDraggingLoraId(null)
    setDropTarget(null)
  }

  function moveLora(id: string, before: boolean) {
    const next = reorderActiveLoras(normalizedOrder, draggedLora.current || '', id, before)
    if (next) {
      setActiveLoraOrder(next)
    }
    endDrag()
  }

  function dragStart(event: DragEvent<HTMLElement>, id: string) {
    draggedLora.current = id
    setDraggingLoraId(id)
    setDropTarget(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    const rect = event.currentTarget.getBoundingClientRect()
    event.dataTransfer.setDragImage(
      event.currentTarget,
      Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    )
  }

  function dragOver(event: DragEvent<HTMLElement>, id: string) {
    const source = draggedLora.current
    if (!source || source === id) {
      setDropTarget(null)
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    const before = event.clientX < rect.left + rect.width / 2
    const from = normalizedOrder.indexOf(source)
    const next = normalizedOrder.filter((item) => item !== source)
    const insertAt = next.indexOf(id) + (before ? 0 : 1)
    if (from < 0 || insertAt === from) {
      setDropTarget(null)
      return
    }
    setDropTarget((previous) => (
      previous?.id === id && previous.before === before ? previous : { id, before }
    ))
  }

  function drop(event: DragEvent<HTMLElement>, id: string) {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    moveLora(id, event.clientX < rect.left + rect.width / 2)
  }
  function focus(swap: ModelSwap, tab: GenerateTab) {
    setSwapTarget(sameModelSwap(swapTarget, swap) ? null : swap)
    onOpenTab(tab)
  }
  const groups: Group[] = [
    {
      id: 'models',
      tab: 'Base Model',
      labelEach: true,
      tiles: [
        slotTile('Checkpoint', checkpoint, checkpoints, 'checkpoints', setCheckpoint, { slot: 'checkpoint' }),
        slotTile('Text encoder', textEncoder, checkpoints, 'checkpoints', setTextEncoder, { slot: 'textEncoder' }),
        slotTile('VAE', vae, vaes, 'vae', setVae, { slot: 'vae' }),
      ],
    },
    {
      id: 'loras',
      tab: 'LoRa',
      label: 'LoRa',
      tiles: [
        ...orderedRefs.map((ref) => {
          const typeMismatch = Boolean(
            checkpointItem?.types?.length &&
              ref.item?.types?.length &&
              !modelTypesMatch(checkpointItem.types, ref.item.types),
          )
          const strength =
            ref.mode === 'auto'
              ? activeLoraStrengths[ref.path] ?? ref.item?.strength ?? 1
              : ref.hit?.strength ?? 1
          const rangeMin = ref.item?.slider ? loraSliderMin : loraStrengthMin
          const rangeMax = ref.item?.slider ? loraSliderMax : loraStrengthMax
          const strengthControl = (
            <LoraStrengthSlider
              label={ref.item ? displayName(ref.item, ref.path) : ref.hit?.name || ref.path}
              value={strength}
              min={rangeMin}
              max={rangeMax}
              onChange={(value) => {
                if (ref.mode === 'auto') {
                  setActiveLoraStrength(ref.path, value)
                  return
                }
                setPrompt(setLoraStrengthAt(prompt, ref.index, value))
              }}
            />
          )
          const dropPosition: 'before' | 'after' | undefined =
            dropTarget?.id === ref.id ? (dropTarget.before ? 'before' : 'after') : undefined
          const dragProps = {
            dragId: ref.id,
            dragging: draggingLoraId === ref.id,
            dropPosition,
            onDragStart: (event: DragEvent<HTMLElement>) => dragStart(event, ref.id),
            onDragOver: (event: DragEvent<HTMLElement>) => dragOver(event, ref.id),
            onDrop: (event: DragEvent<HTMLElement>) => drop(event, ref.id),
            onDragEnd: endDrag,
          }
          if (ref.mode === 'auto') {
            return {
              ...promptTile(
                'LoRa',
                ref.item ? displayName(ref.item, ref.path) : ref.path,
                ref.item,
                'loras',
                -1,
                { slot: 'lora', index: -1, path: ref.path, auto: true },
                () => {
                  toggleAutoLora(ref.path)
                  if (swapTarget?.slot === 'lora' && swapTarget.path === ref.path && swapTarget.auto) {
                    setSwapTarget(null)
                  }
                },
                formatLoraStrength(strength),
                typeMismatch,
              ),
              ...dragProps,
              strengthControl,
              showStrengthControl: showStrengthControls,
            }
          }
          return {
            ...promptTile(
              'LoRa',
              ref.hit?.name || ref.path,
              ref.item,
              'loras',
              ref.index,
              { slot: 'lora', index: ref.index, path: ref.path, auto: false },
              () => {
                const extra = ref.item?.prompt || ''
                const next = removeLoraAt(prompt, negativePrompt, ref.index, extra)
                setPrompt(next.prompt)
                setNegativePrompt(next.negativePrompt)
                if (swapTarget?.slot === 'lora' && swapTarget.index === ref.index && !swapTarget.auto) {
                  setSwapTarget(null)
                }
              },
              ref.hit?.invalid ? ref.hit.raw.trim() || '?' : formatLoraStrength(ref.hit?.strength ?? 1),
              ref.hit?.invalid || typeMismatch,
            ),
            ...dragProps,
            strengthControl,
            showStrengthControl: showStrengthControls,
          }
        }),
        emptyTile('LoRa', { slot: 'lora', index: -1 }),
      ],
    },
    {
      id: 'wildcards',
      tab: 'Wildcards',
      label: 'Wildcards',
      tiles: [
        ...wildHits.map((hit, index) => {
          const item = wildcards.find((row) => wildcardMatches(row, hit.name)) ?? null
          return promptTile('Wildcard', hit.name, item, 'wildcards', index, { slot: 'wildcard', index }, () => {
            setPrompt(removeWildcardAt(prompt, index))
            if (swapTarget?.slot === 'wildcard' && swapTarget.index === index) {
              setSwapTarget(null)
            }
          })
        }),
        emptyTile('Wildcard', { slot: 'wildcard', index: -1 }),
      ],
    },
  ]

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) {
      return
    }
    function update() {
      if (!el) {
        return
      }
      const left = el.scrollLeft > 1
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setFade((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    const inner = el.firstElementChild
    if (inner) {
      ro.observe(inner)
    }
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [style, prompt, loraHits.length, wildHits.length])

  return (
    <div
      className={['flex min-w-0 items-start transition-[gap] duration-300 ease-out motion-reduce:transition-none', spec.gap].join(' ')}
      onMouseEnter={() => setShowStrengthControls(true)}
      onMouseLeave={() => setShowStrengthControls(false)}
    >
      <div className="flex shrink-0 flex-col gap-0.5">
        <RowLabel show={spec.overlay}>&nbsp;</RowLabel>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <button
            type="button"
            className={[
              'flex aspect-square w-5 shrink-0 items-center justify-center rounded border transition duration-150',
              style === 'text'
                ? 'border-accent bg-accent text-ink'
                : 'border-line bg-field text-muted hover:bg-line hover:text-ink',
            ].join(' ')}
            aria-label={style === 'text' ? 'Show thumbnails' : 'Text row'}
            title={style === 'text' ? 'Show thumbnails' : 'Text row'}
            onClick={() => setModelTileStyle(style === 'text' ? 'tall' : 'text')}
          >
            <AppIcon id="list" size={10} />
          </button>
          {style === 'text' ? null : (
            <button
              type="button"
              className="flex min-h-5 w-5 flex-1 items-center justify-center rounded border border-line bg-field text-muted transition duration-150 hover:bg-line hover:text-ink"
              aria-label={style === 'compact' ? 'Expand tiles' : 'Compact tiles'}
              title={style === 'compact' ? 'Expand tiles' : 'Compact tiles'}
              onClick={() => setModelTileStyle(style === 'compact' ? 'tall' : 'compact')}
            >
              <span
                className={[
                  'inline-flex transition-transform duration-300 ease-out motion-reduce:transition-none',
                  style === 'compact' ? 'rotate-180' : '',
                ].join(' ')}
              >
                <AppIcon id="chevron-up" size={10} />
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="relative min-w-0 flex-1">
        <div ref={scrollerRef} className="min-w-0 overflow-x-auto py-1.5">
          <div className={['flex w-max items-start transition-[gap] duration-300 ease-out motion-reduce:transition-none', spec.gap].join(' ')}>
            {groups.map((group, index) => (
              <div key={group.id} className="contents">
                {index > 0 ? <span className="mx-1 w-px shrink-0 self-stretch bg-line" /> : null}
                {group.labelEach ? (
                  group.tiles.map((tile) => (
                    <div key={tile.key} className="flex shrink-0 flex-col gap-0.5">
                      <RowLabel show={spec.overlay} width={spec.width} title={tile.role}>
                        {tile.role}
                      </RowLabel>
                      <Tile
                        style={style}
                        tile={tile}
                        active={sameModelSwap(swapTarget, tile.swap)}
                        onOpen={() => focus(tile.swap, group.tab)}
                      />
                    </div>
                  ))
                ) : (
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <RowLabel show={spec.overlay}>{group.label}</RowLabel>
                    <div
                      className={[
                        'flex transition-[gap] duration-300 ease-out motion-reduce:transition-none',
                        spec.gap,
                      ].join(' ')}
                    >
                      {group.tiles.map((tile) => (
                        <Tile
                          key={tile.key}
                          style={style}
                          tile={tile}
                          active={sameModelSwap(swapTarget, tile.swap)}
                          onOpen={() => focus(tile.swap, group.tab)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <span
          aria-hidden="true"
          className={[
            'pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-bg to-transparent transition-opacity duration-150',
            fade.left ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />
        <span
          aria-hidden="true"
          className={[
            'pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent transition-opacity duration-150',
            fade.right ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />
      </div>
    </div>
  )
}

