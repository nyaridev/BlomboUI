export function filesFromClipboard(event: ClipboardEvent): File[] {
  const data = event.clipboardData
  if (!data) {
    return []
  }
  if (data.files.length) {
    return [...data.files]
  }
  const files: File[] = []
  for (const item of data.items) {
    if (item.kind !== 'file') {
      continue
    }
    const file = item.getAsFile()
    if (file) {
      files.push(file)
    }
  }
  return files
}
