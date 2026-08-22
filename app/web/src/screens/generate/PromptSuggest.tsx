import { AppIcon } from '@/components/AppIcon.tsx'
import { TilePreview } from '@/components/TilePreview.tsx'
import { getPromptTagUsage, suggestPromptTags, type FrequentPromptTag, type ModelEntry, type PromptTagHit } from '@/lib/api.ts'
import { modelThumbSrc } from '@/lib/thumbView.ts'
import { appendPromptChunk } from '@/lib/loraTags.ts'
import {
  applyTagUsage,
  caretBox,
  completeInsert,
  completeToken,
  loraInsert,
  suggestLoraHits,
  suggestWildcardHits,
  tokenAt,
  type PromptToken,
  type SuggestHit,
} from '@/lib/promptComplete.ts'
import { usePromptWeightKey } from '@/lib/promptWeight.ts'
import { useGenerateStore } from '@/stores/generateStore.ts'
import { modelPath, useModelsStore } from '@/stores/modelsStore.ts'
import { autocompleteApplies, useSettingsStore } from '@/stores/settingsStore.ts'
import { useThumbView } from '@/stores/thumbnailScopeStore.ts'
import { PromptHighlight } from './PromptHighlight.tsx'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

const WINDOW = 10
const THUMB_W = 192

function suggestThumb(hit: SuggestHit, loras: ModelEntry[], wildcards: ModelEntry[]) {
  if ((hit.kind !== 'lora' && hit.kind !== 'wildcard') || !hit.path) {
    return null
  }
  const kind = hit.kind === 'lora' ? 'loras' : 'wildcards'
  const items = hit.kind === 'lora' ? loras : wildcards
  const item = items.find((row) => row.path === hit.path) || { path: hit.path, thumb: hit.thumb || 0, thumb_global: 0 }
  return modelThumbSrc(kind, item)
}

function abbrevCount(value: number) {
  if (value >= 1_000_000) {
    const n = value / 1_000_000
    return `${n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, '')}M`
  }
  if (value >= 1_000) {
    const n = value / 1_000
    return `${n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(value)
}

function fieldClass(disabled: boolean) {
  return [
    'h-full w-full resize-none overflow-y-auto rounded border border-line bg-field px-2 py-1.5 pr-5 pb-4 font-mono text-sm text-ink outline-none placeholder:text-muted focus:border-accent',
    disabled ? 'cursor-not-allowed' : '',
  ].join(' ')
}

export function PromptField({
  value,
  onChange,
  disabled = false,
  placeholder,
  side = 'prompt',
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  side?: 'prompt' | 'negative'
}) {
  const checkpoint = useGenerateStore((s) => s.checkpoint)
  const negativePrompt = useGenerateStore((s) => s.negativePrompt)
  const setNegativePrompt = useGenerateStore((s) => s.setNegativePrompt)
  const loras = useModelsStore((s) => s.loras)
  const wildcards = useModelsStore((s) => s.wildcards)
  const checkpoints = useModelsStore((s) => s.checkpoints)
  const autocompleteEnabled = useSettingsStore((s) => s.autocompleteEnabled)
  const autocompleteMode = useSettingsStore((s) => s.autocompleteMode)
  const autocompleteTypes = useSettingsStore((s) => s.autocompleteTypes)
  const wildcardCompleteEnabled = useSettingsStore((s) => s.wildcardCompleteEnabled)
  const loraCompleteEnabled = useSettingsStore((s) => s.loraCompleteEnabled)
  const loraTriggerCompleteEnabled = useSettingsStore((s) => s.loraTriggerCompleteEnabled)
  const wildcardCompleteThumbs = useSettingsStore((s) => s.wildcardCompleteThumbs)
  const loraCompleteThumbs = useSettingsStore((s) => s.loraCompleteThumbs)
  const autocompleteThumbScale = useSettingsStore((s) => s.autocompleteThumbScale)
  const frequentTagsEnabled = useSettingsStore((s) => s.frequentTagsEnabled)
  useThumbView()
  const modelTypes = useMemo(() => {
    const item = checkpoints.find((row) => modelPath(row) === checkpoint)
    return item?.types ?? []
  }, [checkpoint, checkpoints])
  const tagAllowed = autocompleteEnabled && autocompleteApplies(autocompleteMode, autocompleteTypes, modelTypes)
  const onWeightKey = usePromptWeightKey(onChange)
  const area = useRef<HTMLTextAreaElement>(null)
  const highlight = useRef<HTMLDivElement>(null)
  const cache = useRef<{ key: string; tags: SuggestHit[] } | null>(null)
  const usage = useRef<{ prefix: string; tags: FrequentPromptTag[]; at: number } | null>(null)
  const pending = useRef<{ el: HTMLTextAreaElement; start: number; end: number } | null>(null)
  const resync = useRef(false)
  const [token, setToken] = useState<PromptToken | null>(null)
  const [hits, setHits] = useState<SuggestHit[]>([])
  const [selected, setSelected] = useState(0)
  const [offset, setOffset] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const dismissed = useRef('')
  const hoverArmed = useRef(false)
  const lastMouse = useRef<{ x: number; y: number } | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const hitsRef = useRef(hits)
  hitsRef.current = hits
  const [focused, setFocused] = useState(false)
  const [retry, setRetry] = useState(0)
  const allowed =
    token?.mode === 'wildcard'
      ? wildcardCompleteEnabled
      : token?.mode === 'lora'
        ? loraCompleteEnabled
        : tagAllowed
  const open = Boolean(allowed && focused && token && hits.length > 0 && pos)
  const shown = hits.slice(offset, offset + WINDOW)
  const active = hits[selected]
  const showThumb =
    Boolean(active) &&
    ((active?.kind === 'lora' && loraCompleteThumbs) || (active?.kind === 'wildcard' && wildcardCompleteThumbs))
  const thumbW = THUMB_W * autocompleteThumbScale

  useLayoutEffect(() => {
    const next = pending.current
    if (next) {
      pending.current = null
      if (document.contains(next.el)) {
        next.el.setSelectionRange(next.start, next.end)
      }
    }
    if (area.current && highlight.current) {
      highlight.current.scrollTop = area.current.scrollTop
      highlight.current.scrollLeft = area.current.scrollLeft
    }
    if (!resync.current) {
      return
    }
    resync.current = false
    const el = area.current
    if (!el || el.disabled) {
      setToken(null)
      setPos(null)
      return
    }
    const token = tokenAt(el.value, el.selectionStart ?? 0)
    setToken(token)
    if (!token) {
      setPos(null)
      return
    }
    const box = caretBox(el, token.caret)
    setPos({ top: box.top, left: box.left })
  })

  function sync() {
    const el = area.current
    if (!el || el.disabled) {
      setToken(null)
      setPos(null)
      return
    }
    const next = tokenAt(el.value, el.selectionStart ?? 0)
    setToken(next)
    if (!next) {
      setPos(null)
      return
    }
    const box = caretBox(el, next.caret)
    setPos({ top: box.top, left: box.left })
  }

  function move(dir: number) {
    setSelected((i) => {
      const last = hitsRef.current.length - 1
      if (last < 0) {
        return i
      }
      const next = Math.max(0, Math.min(last, i + dir))
      setOffset((off) => {
        if (next >= off + WINDOW) {
          return next - WINDOW + 1
        }
        if (next < off) {
          return next
        }
        return off
      })
      return next
    })
  }

  function pick(item: SuggestHit) {
    const el = area.current
    if (!el) {
      return
    }
    const current = tokenAt(el.value, el.selectionStart ?? 0)
    if (!current) {
      return
    }
    let insert = item.tag
    if (item.kind === 'lora') {
      insert = loraInsert(item, loraTriggerCompleteEnabled)
      if (loraTriggerCompleteEnabled && side === 'negative' && item.negative?.trim()) {
        insert += `, ${item.negative.trim()}`
      }
    }
    const next =
      item.kind === 'tag'
        ? completeToken(el.value, current.start, current.end, item.tag)
        : completeInsert(el.value, current.start, current.end, insert, !item.partial)
    pending.current = { el, start: next.caret, end: next.caret }
    onChange(next.text)
    if (item.kind === 'lora' && loraTriggerCompleteEnabled && side === 'prompt' && item.negative?.trim()) {
      setNegativePrompt(appendPromptChunk(negativePrompt, item.negative))
    }
    if (item.partial) {
      resync.current = true
      setHits([])
      return
    }
    setHits([])
    setToken(null)
    setPos(null)
  }

  function dismiss() {
    dismissed.current = token?.query ?? ''
    setHits([])
    setToken(null)
    setPos(null)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        move(1)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        move(-1)
        return
      }
      if ((event.key === 'Tab' && !event.shiftKey) || event.key === 'Enter') {
        event.preventDefault()
        const item = hits[selected]
        if (item) {
          pick(item)
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
        return
      }
    }
    onWeightKey(event)
  }

  function onListMouseMove(event: MouseEvent<HTMLUListElement>) {
    const prev = lastMouse.current
    lastMouse.current = { x: event.clientX, y: event.clientY }
    if (!prev || (prev.x === event.clientX && prev.y === event.clientY)) {
      return
    }
    hoverArmed.current = true
    const row = (event.target as HTMLElement).closest('[data-index]')
    const abs = Number(row?.getAttribute('data-index'))
    if (Number.isFinite(abs)) {
      setSelected(abs)
    }
  }

  useEffect(() => {
    const query = token?.query ?? ''
    if (!allowed || !query) {
      dismissed.current = ''
      setHits([])
      return
    }
    if (query === dismissed.current) {
      setHits([])
      return
    }
    const key = `${checkpoint}\0${token?.mode ?? ''}\0${query}`
    if (cache.current?.key === key && token?.mode === 'tag') {
      setHits(cache.current.tags)
      return
    }
    if (token?.mode === 'wildcard' || token?.mode === 'lora') {
      const prefix = token.mode === 'wildcard' ? '__' : '<lora:'
      const local =
        token.mode === 'wildcard' ? suggestWildcardHits(query, wildcards) : suggestLoraHits(query, loras)
      const cached = usage.current && usage.current.prefix === prefix ? usage.current.tags : []
      const tags = applyTagUsage(local, cached)
      cache.current = { key, tags }
      setHits(tags)
      if (!frequentTagsEnabled) {
        return
      }
      const fresh = usage.current && usage.current.prefix === prefix && Date.now() - usage.current.at < 4000
      if (fresh) {
        return
      }
      const ac = new AbortController()
      void getPromptTagUsage(prefix, ac.signal)
        .then((rows) => {
          if (ac.signal.aborted) {
            return
          }
          usage.current = { prefix, tags: rows, at: Date.now() }
          const next = applyTagUsage(local, rows)
          cache.current = { key, tags: next }
          setHits(next)
        })
        .catch(() => {})
      return () => ac.abort()
    }
    const ac = new AbortController()
    let retryTimer = 0
    const timer = window.setTimeout(() => {
      void suggestPromptTags(query, checkpoint, ac.signal)
        .then((data) => {
          const tags: SuggestHit[] = data.tags.map((item: PromptTagHit) => ({ ...item, kind: 'tag' as const }))
          setHits(tags)
          if (data.ready) {
            cache.current = { key, tags }
          } else {
            retryTimer = window.setTimeout(() => {
              if (!ac.signal.aborted) {
                setRetry((n) => n + 1)
              }
            }, 250)
          }
        })
        .catch(() => {
          if (!ac.signal.aborted) {
            setHits([])
          }
        })
    }, 40)
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(retryTimer)
      ac.abort()
    }
  }, [allowed, checkpoint, frequentTagsEnabled, loras, retry, token?.mode, token?.query, wildcards])

  useEffect(() => {
    setSelected(0)
    setOffset(0)
    hoverArmed.current = false
    lastMouse.current = null
  }, [checkpoint, token?.query])

  useEffect(() => {
    if (!open) {
      hoverArmed.current = false
      lastMouse.current = null
      return
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      event.stopPropagation()
      move(event.deltaY > 0 ? 1 : -1)
    }
    const list = listRef.current
    const field = area.current
    list?.addEventListener('wheel', onWheel, { passive: false })
    field?.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      list?.removeEventListener('wheel', onWheel)
      field?.removeEventListener('wheel', onWheel)
    }
  }, [open])

  return (
    <>
      <div className="relative h-full min-w-0 rounded bg-field">
        <PromptHighlight ref={highlight} text={value} loras={loras} side={side} />
        <textarea
          ref={area}
          className={[fieldClass(disabled), 'prompt-editor relative z-10 selection:bg-accent/30'].join(' ')}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onKeyUp={sync}
          onClick={sync}
          onSelect={sync}
          onInput={sync}
          onScroll={(event) => {
            if (highlight.current) {
              highlight.current.scrollTop = event.currentTarget.scrollTop
              highlight.current.scrollLeft = event.currentTarget.scrollLeft
            }
            sync()
          }}
          onFocus={() => {
            setFocused(true)
            sync()
          }}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          spellCheck={false}
          disabled={disabled}
        />
      </div>
      {open && pos ? (
        <div
          className="fixed z-[70]"
          style={{ top: pos.top, left: Math.max(8, Math.min(pos.left, window.innerWidth - 240)) }}
        >
          <ul
            ref={listRef}
            className="min-w-56 max-w-sm overflow-hidden rounded border border-line bg-panel py-1 shadow-lg"
            onMouseMove={onListMouseMove}
          >
            {shown.map((item, index) => {
              const abs = offset + index
              const total = item.posts + item.count
              return (
                <li key={`${item.tag}:${item.alias ?? ''}:${item.partial ? 1 : 0}`}>
                  <button
                    type="button"
                    data-index={abs}
                    className={[
                      'flex w-full items-center gap-2 px-2 py-1 text-left font-mono text-sm',
                      abs === selected ? 'bg-line text-ink' : 'text-ink',
                    ].join(' ')}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => pick(item)}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.alias ? `${item.alias} -> ${item.tag}` : item.tag}
                    </span>
                    {item.favorite ? (
                      <AppIcon id="star" size={12} className="fill-current text-[#eab308]" />
                    ) : total > 0 ? (
                      <span className="shrink-0 text-xs text-muted">{abbrevCount(total)}</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
          {showThumb && active ? (
            <div
              className="pointer-events-none absolute top-0"
              style={
                pos.left > window.innerWidth - 248 - thumbW
                  ? { right: '100%', marginRight: 6 }
                  : { left: '100%', marginLeft: 6 }
              }
            >
              <div style={{ width: thumbW }}>
                <TilePreview
                  src={suggestThumb(active, loras, wildcards)}
                  mark=""
                  eager
                  className="w-full rounded border border-line shadow-lg"
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
