const SPLIT_MIN = 0.02
const SPLIT_MAX = 0.98
const COMPARE_WORKFLOWS = new Set(['background_removal', 'image_upscale'])

export function compareWorkflow(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload) {
    return false
  }
  const raw = String(payload.workflow || payload.workflow_id || '')
  const name = raw.replace(/\\/g, '/').split('/').pop() || ''
  const stem = name.replace(/\.json$/i, '')
  return COMPARE_WORKFLOWS.has(stem)
}

export function inputPathCount(payload: Record<string, unknown> | null | undefined): number {
  const raw = payload?.input_paths
  return Array.isArray(raw) ? raw.length : 0
}

export function clampSplit(value: number) {
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, value))
}

export function containRect(nw: number, nh: number, cw: number, ch: number) {
  if (nw <= 0 || nh <= 0 || cw <= 0 || ch <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }
  const scale = Math.min(cw / nw, ch / nh)
  const w = nw * scale
  const h = nh * scale
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }
}

export { SPLIT_MIN, SPLIT_MAX }
