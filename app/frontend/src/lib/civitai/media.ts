const GIF_EXT = /\.gif(\?|$)/i
const VIDEO_EXT = /\.(mp4|webm|mkv)(\?|$)/i

export function isGifPreview(url: string) {
  if (!url) {
    return false
  }
  try {
    return new URL(url, window.location.href).pathname.toLowerCase().endsWith('.gif')
  } catch {
    return GIF_EXT.test(url)
  }
}

export function isVideoPreview(url: string, type?: string) {
  if ((type || '').toLowerCase() === 'video') {
    return true
  }
  if (!url) {
    return false
  }
  try {
    const path = new URL(url, window.location.href).pathname.toLowerCase()
    return path.endsWith('.mp4') || path.endsWith('.webm') || path.endsWith('.mkv')
  } catch {
    return VIDEO_EXT.test(url)
  }
}
