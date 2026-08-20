// Small shared helpers for the image tools (Studio). All work happens on the
// client via <canvas>, so nothing here needs a network round-trip.
import { MAX_IMAGE_DIMENSION_PX, MAX_IMAGE_FILE_BYTES, MAX_IMAGE_PIXELS } from '@/lib/constants'

export function assertSafeImageDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('A imagem está corrompida ou não possui dimensões válidas.')
  }
  if (width > MAX_IMAGE_DIMENSION_PX || height > MAX_IMAGE_DIMENSION_PX || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('A imagem é grande demais para processar com segurança. Reduza suas dimensões e tente novamente.')
  }
}

/** Loads a Blob into an HTMLImageElement (object URL is revoked after load). */
export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (blob.size === 0) {
      reject(new Error('O arquivo de imagem está vazio.'))
      return
    }
    if (blob.size > MAX_IMAGE_FILE_BYTES) {
      reject(new Error('O arquivo excede o limite de 50 MB.'))
      return
    }
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      try {
        assertSafeImageDimensions(img.naturalWidth, img.naturalHeight)
        resolve(img)
      } catch (error) {
        reject(error)
      } finally {
        // Defer revoke so drawImage in the same tick still has the source.
        setTimeout(() => URL.revokeObjectURL(url), 0)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível carregar a imagem.'))
    }
    img.src = url
  })
}

/** Validates and converts any browser-decodable raster image to a real PNG blob. */
export async function convertBlobToPng(blob: Blob): Promise<Blob> {
  const img = await loadImageFromBlob(blob)
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error('A imagem está corrompida ou não possui dimensões válidas.')
  }
  if (blob.type.toLowerCase() === 'image/png') return blob

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.')
  ctx.drawImage(img, 0, 0)
  return canvasToBlob(canvas, 'image/png')
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
