import type { PackingMask } from '@/types'
import { MAX_IMAGE_DIMENSION_PX, MAX_IMAGE_FILE_BYTES, MAX_IMAGE_PIXELS } from '@/lib/constants'

export interface PackingImageAnalysis {
  xPx: number
  yPx: number
  widthPx: number
  heightPx: number
  naturalWidthPx: number
  naturalHeightPx: number
  packingMask?: PackingMask
}

const SCAN_MAX_SIDE = 256
const DEFAULT_ALPHA_THRESHOLD = 8
const BACKGROUND_DISTANCE = 32
const UNIFORM_BORDER_DISTANCE = 20
const MIN_UNIFORM_BORDER_RATIO = 0.9

function fullAnalysis(naturalWidthPx: number, naturalHeightPx: number): PackingImageAnalysis {
  return {
    xPx: 0,
    yPx: 0,
    widthPx: naturalWidthPx,
    heightPx: naturalHeightPx,
    naturalWidthPx,
    naturalHeightPx,
  }
}

/**
 * Converts RGBA pixels into a tight binary ink mask. Kept public and free of
 * browser APIs so the packing rules can be unit-tested independently.
 */
export function extractPackingAnalysis(
  rgba: Uint8ClampedArray,
  scanWidth: number,
  scanHeight: number,
  naturalWidthPx: number,
  naturalHeightPx: number,
  alphaThreshold = DEFAULT_ALPHA_THRESHOLD
): PackingImageAnalysis {
  if (scanWidth < 1 || scanHeight < 1 || rgba.length < scanWidth * scanHeight * 4) {
    return fullAnalysis(naturalWidthPx, naturalHeightPx)
  }

  const ink = createInkMap(rgba, scanWidth, scanHeight, alphaThreshold)
  let minX = scanWidth
  let minY = scanHeight
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < scanHeight; y++) {
    for (let x = 0; x < scanWidth; x++) {
      if (!ink[y * scanWidth + x]) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  // A fully transparent/corrupt image must not become a zero-area object that
  // can overlap everything. Treat it as an opaque rectangle via the fallback.
  if (maxX < minX || maxY < minY) return fullAnalysis(naturalWidthPx, naturalHeightPx)

  const maskWidth = maxX - minX + 1
  const maskHeight = maxY - minY + 1
  const data = new Uint8Array(maskWidth * maskHeight)
  for (let y = 0; y < maskHeight; y++) {
    for (let x = 0; x < maskWidth; x++) {
      data[y * maskWidth + x] = ink[(y + minY) * scanWidth + x + minX]
    }
  }

  const scaleX = naturalWidthPx / scanWidth
  const scaleY = naturalHeightPx / scanHeight
  const xPx = Math.max(0, Math.floor(minX * scaleX))
  const yPx = Math.max(0, Math.floor(minY * scaleY))
  const endXPx = Math.min(naturalWidthPx, Math.ceil((maxX + 1) * scaleX))
  const endYPx = Math.min(naturalHeightPx, Math.ceil((maxY + 1) * scaleY))

  return {
    xPx,
    yPx,
    widthPx: Math.max(1, endXPx - xPx),
    heightPx: Math.max(1, endYPx - yPx),
    naturalWidthPx,
    naturalHeightPx,
    packingMask: { widthPx: maskWidth, heightPx: maskHeight, data },
  }
}

function colorDistance(rgba: Uint8ClampedArray, pixel: number, r: number, g: number, b: number): number {
  const offset = pixel * 4
  return Math.hypot(rgba[offset] - r, rgba[offset + 1] - g, rgba[offset + 2] - b)
}

function median(values: number[]): number {
  values.sort((a, b) => a - b)
  return values[Math.floor(values.length / 2)] ?? 0
}

/**
 * Alpha is authoritative when an image has transparency. For fully opaque
 * JPEG/WebP artwork, a colour is considered background only when the complete
 * border is very uniform; photos/noisy borders conservatively remain solid.
 */
export function createInkMap(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = DEFAULT_ALPHA_THRESHOLD
): Uint8Array {
  const result = new Uint8Array(width * height)
  let hasTransparency = false
  for (let pixel = 0; pixel < width * height; pixel++) {
    if (rgba[pixel * 4 + 3] < 250) {
      hasTransparency = true
      break
    }
  }

  if (hasTransparency) {
    for (let pixel = 0; pixel < width * height; pixel++) {
      result[pixel] = rgba[pixel * 4 + 3] > alphaThreshold ? 1 : 0
    }
    return result
  }

  const borderPixels: number[] = []
  for (let x = 0; x < width; x++) {
    borderPixels.push(x, (height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y++) {
    borderPixels.push(y * width, y * width + width - 1)
  }
  const reds = borderPixels.map((pixel) => rgba[pixel * 4])
  const greens = borderPixels.map((pixel) => rgba[pixel * 4 + 1])
  const blues = borderPixels.map((pixel) => rgba[pixel * 4 + 2])
  const background = { r: median(reds), g: median(greens), b: median(blues) }
  const uniformCount = borderPixels.reduce(
    (count, pixel) =>
      count +
      (colorDistance(rgba, pixel, background.r, background.g, background.b) <= UNIFORM_BORDER_DISTANCE ? 1 : 0),
    0
  )
  const hasReliableBackground = uniformCount / Math.max(1, borderPixels.length) >= MIN_UNIFORM_BORDER_RATIO

  for (let pixel = 0; pixel < width * height; pixel++) {
    result[pixel] =
      !hasReliableBackground || colorDistance(rgba, pixel, background.r, background.g, background.b) > BACKGROUND_DISTANCE
        ? 1
        : 0
  }
  return result
}

/** Decodes an upload once and returns both its crop box and printable mask. */
export function analyzeImageForPacking(file: File): Promise<PackingImageAnalysis> {
  return new Promise((resolve, reject) => {
    if (file.size === 0 || file.size > MAX_IMAGE_FILE_BYTES) {
      reject(new Error(file.size === 0 ? 'O arquivo de imagem está vazio.' : 'O arquivo excede o limite de 50 MB.'))
      return
    }
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const naturalWidthPx = img.naturalWidth
      const naturalHeightPx = img.naturalHeight
      if (
        !naturalWidthPx ||
        !naturalHeightPx ||
        naturalWidthPx > MAX_IMAGE_DIMENSION_PX ||
        naturalHeightPx > MAX_IMAGE_DIMENSION_PX ||
        naturalWidthPx * naturalHeightPx > MAX_IMAGE_PIXELS
      ) {
        reject(new Error(`A imagem ${file.name} é grande demais para processar com segurança.`))
        return
      }
      const scale = Math.min(1, SCAN_MAX_SIDE / Math.max(naturalWidthPx, naturalHeightPx))
      const scanWidth = Math.max(1, Math.round(naturalWidthPx * scale))
      const scanHeight = Math.max(1, Math.round(naturalHeightPx * scale))
      const canvas = document.createElement('canvas')
      canvas.width = scanWidth
      canvas.height = scanHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        resolve(fullAnalysis(naturalWidthPx, naturalHeightPx))
        return
      }

      ctx.drawImage(img, 0, 0, scanWidth, scanHeight)
      try {
        const rgba = ctx.getImageData(0, 0, scanWidth, scanHeight).data
        resolve(extractPackingAnalysis(rgba, scanWidth, scanHeight, naturalWidthPx, naturalHeightPx))
      } catch {
        resolve(fullAnalysis(naturalWidthPx, naturalHeightPx))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`Nao foi possivel ler a imagem ${file.name}.`))
    }
    img.src = objectUrl
  })
}
