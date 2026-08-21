import { AppIcon } from '@/components/AppIcon.tsx'
import { modelThumbSrc } from '@/lib/thumbView.ts'
import { type ModelEntry, type ModelLists } from '@/lib/api.ts'
import { formatLoraStrength, loraNameMatches, parseLoraHits, removeLoraAt } from '@/lib/loraTags.ts'
import { parseWildcardTags, removeWildcardAt, wildcardMatches } from '@/lib/wildcardTags.ts'
import { useGenerateStore, sameModelSwap, type ModelSwap } from '@/stores/generateStore.ts'
import { modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ModelTile } from './ModelTile.tsx'
import { modelTileSpec, type ModelTileStyle } from './modelLayouts.ts'
import { type GenerateTab } from './tabs.ts'

const LABEL = 'truncate px-0.5 text-[10px] uppercase tracking-wide text-muted'

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
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const vaes = useModelsStore((s) => s.vae)
  const loras = useModelsStore((s) => s.loras)
  const wildcards = useModelsStore((s) => s.wildcards)
  useThumbView()

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
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState({ left: false, right: false })
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
        ...loraHits.map((hit, index) => {
          const item = loras.find((row) => loraNameMatches(hit.name, row.path)) ?? null
          return promptTile(
            'LoRa',
            hit.name,
            item,
            'loras',
            index,
            { slot: 'lora', index },
            () => {
              const extra = item?.prompt || ''
              const next = removeLoraAt(prompt, negativePrompt, index, extra)
              setPrompt(next.prompt)
              setNegativePrompt(next.negativePrompt)
              if (swapTarget?.slot === 'lora' && swapTarget.index === index) {
                setSwapTarget(null)
              }
            },
            hit.invalid ? hit.raw.trim() || '?' : formatLoraStrength(hit.strength),
            hit.invalid,
          )
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
    <div className={['flex min-w-0 items-stretch transition-[gap] duration-300 ease-out motion-reduce:transition-none', spec.gap].join(' ')}>
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
          <div className={['flex w-max items-end transition-[gap] duration-300 ease-out motion-reduce:transition-none', spec.gap].join(' ')}>
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

function RowLabel({
  show,
  width,
  title,
  children,
}: {
  show: boolean
  width?: string
  title?: string
  children: ReactNode
}) {
  return (
    <span
      className={[
        LABEL,
        'min-w-0 overflow-hidden transition-[max-height,opacity,width] duration-300 ease-out motion-reduce:transition-none',
        show ? ['max-h-4 opacity-100', width || ''].join(' ') : 'max-h-0 w-0 px-0 opacity-0',
      ].join(' ')}
      title={title}
    >
      {children}
    </span>
  )
}

function Tile({
  style,
  tile,
  onOpen,
  active,
}: {
  style: ModelTileStyle
  tile: TileSpec
  onOpen: () => void
  active: boolean
}) {
  return (
    <ModelTile
      style={style}
      role={tile.role}
      name={tile.name}
      src={tile.src}
      empty={tile.empty}
      unresolved={tile.unresolved}
      badge={tile.badge}
      warn={tile.warn}
      onOpen={onOpen}
      onClear={tile.onClear}
      active={active}
    />
  )
}

type Group = {
  id: string
  tab: GenerateTab
  label?: string
  labelEach?: boolean
  tiles: TileSpec[]
}

type TileSpec = {
  key: string
  role: string
  name: string
  swap: ModelSwap
  src?: string | null
  empty?: boolean
  unresolved?: boolean
  badge?: string
  warn?: boolean
  onClear?: () => void
}

function slotTile(
  role: string,
  value: string,
  items: ModelEntry[],
  kind: keyof ModelLists,
  onClear: (value: string) => void,
  swap: ModelSwap,
): TileSpec {
  if (!value.trim()) {
    return { key: `${role}-empty`, role, name: role, empty: true, swap }
  }
  const item = items.find((row) => modelPath(row) === value) ?? null
  return {
    key: `${role}-${value}`,
    role,
    name: displayName(item, value),
    src: thumbSrc(kind, item),
    unresolved: !item,
    onClear: () => onClear(''),
    swap,
  }
}

function promptTile(
  role: string,
  tagName: string,
  item: ModelEntry | null,
  kind: keyof ModelLists,
  index: number,
  swap: ModelSwap,
  onClear: () => void,
  badge?: string,
  warn?: boolean,
): TileSpec {
  return {
    key: `${role}-${index}-${tagName}`,
    role,
    name: displayName(item, tagName),
    src: thumbSrc(kind, item),
    unresolved: !item,
    badge,
    warn,
    onClear,
    swap,
  }
}

function emptyTile(role: string, swap: ModelSwap): TileSpec {
  return { key: `${role}-add`, role, name: role, empty: true, swap }
}

function displayName(item: ModelEntry | null, fallback: string) {
  if (!item) {
    return fileName(fallback)
  }
  return item.label || item.tag || fileName(item.path) || fileName(fallback)
}

function fileName(path: string) {
  const base = path.replace(/\\/g, '/').split('/').pop() || path
  return base.replace(/\.[^/.]+$/, '')
}

function thumbSrc(kind: keyof ModelLists, item: ModelEntry | null) {
  return modelThumbSrc(kind, item)
}
