export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function downloadUrl(url: string, filename: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Unable to download the print image.')
  downloadBlob(await response.blob(), filename)
}
