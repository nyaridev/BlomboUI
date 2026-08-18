import { ImageDrop } from '@/components/ImageDrop.tsx'
import { getKSamplerChoices, getWorkflows, readPngInfo } from '@/lib/api.ts'
import { SAMPLERS, SCHEDULERS } from '@/screens/generate/resolutions.ts'
import { PARAM_KEYS, pickParams, useGenerateStore } from '@/stores/generateStore.ts'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { applyPngInfo, parsePngInfo } from './parse.ts'

export function PngInfoScreen() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const navigate = useNavigate()
  const applyParams = useGenerateStore((s) => s.applyParams)
  const canSend = Boolean(text.trim()) && !busy && !sending

  async function onFile(file: File | null) {
    if (!file) {
      setText('')
      return
    }
    setBusy(true)
    try {
      setText(await readPngInfo(file))
    } catch (err) {
      setText(err instanceof Error ? err.message : 'Could not read metadata')
    } finally {
      setBusy(false)
    }
  }

  async function sendToGenerate() {
    if (!canSend) {
      return
    }
    setSending(true)
    try {
      const parsed = parsePngInfo(text)
      const workflow = useGenerateStore.getState().workflow
      let allowed = new Set<string>(PARAM_KEYS)
      try {
        const items = await getWorkflows()
        const params = items.find((item) => item.id === workflow)?.params
        if (params?.length) {
          allowed = new Set(params)
        }
      } catch {
        /* keep all keys */
      }
      let samplers = [...SAMPLERS]
      let schedulers = [...SCHEDULERS]
      try {
        const choices = await getKSamplerChoices()
        if (choices.samplers.length) {
          samplers = choices.samplers
        }
        if (choices.schedulers.length) {
          schedulers = choices.schedulers
        }
      } catch {
        /* use local lists */
      }
      applyParams(applyPngInfo(pickParams(useGenerateStore.getState()), parsed, allowed, { samplers, schedulers }))
      navigate('/')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-[min(42rem,calc(100svh-11rem))] min-h-0 items-stretch gap-4">
      <ImageDrop className="aspect-square h-full w-auto shrink-0" onFile={(file) => void onFile(file)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <textarea
          className="min-h-0 min-w-0 flex-1 resize-none rounded border border-line bg-field px-2 py-1.5 font-mono text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          value={busy ? 'Reading…' : text}
          placeholder="Drop an image to read generation metadata"
          readOnly
          spellCheck={false}
        />
        <button
          type="button"
          className="w-full rounded bg-accent px-3 py-1.5 text-sm text-ink disabled:opacity-40"
          disabled={!canSend}
          onClick={() => void sendToGenerate()}
        >
          {sending ? 'Sending…' : 'Send to Generate'}
        </button>
      </div>
    </div>
  )
}
