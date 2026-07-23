// Small shared helpers for the image tools (Studio). All work happens on the
// client via <canvas>, so nothing here needs a network round-trip.

/** Loads a Blob into an HTMLImageElement (object URL is revoked after load). */
export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      resolve(img)
      // Defer revoke so drawImage in the same tick still has the source.
      setTimeout(() => URL.revokeObjectURL(url), 0)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível carregar a imagem.'))
    }
    img.src = url
  })
}

/** Draws a Blob onto a canvas and returns its ImageData (full resolution). */
export async function blobToImageData(blob: Blob): Promise<ImageData> {
  const img = await loadImageFromBlob(blob)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.')
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** Promise wrapper around canvas.toBlob. */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.'))),
      type,
      quality
    )
  })
}

/** Triggers a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Triggers a browser download for a text payload (e.g. an SVG string). */
export function downloadText(text: string, filename: string, mime = 'image/svg+xml') {
  downloadBlob(new Blob([text], { type: mime }), filename)
}

/** Replaces the extension of a filename (defaults to stripping any). */
export function withExtension(name: string, ext: string): string {
  return `${name.replace(/\.[^./\\]+$/, '')}.${ext}`
}
