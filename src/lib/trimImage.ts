import type { ArtMask } from '@/types'

export interface ContentBox {
  xPx: number
  yPx: number
  widthPx: number
  heightPx: number
  naturalWidthPx: number
  naturalHeightPx: number
}

export interface ArtGeometry {
  box: ContentBox
  mask: ArtMask
}

// Scanning at full resolution is wasteful for large prints; a small
// downsampled copy is enough to locate the bounding box of visible pixels
// and to build the coarse occupancy mask used by the shape packer.
const SCAN_MAX_SIDE = 512

// Normalized occupancy mask resolution: at most this many cells on the content
// box's longer side. The packer resamples it to the real sheet grid later, so
// this only needs to be fine enough to capture the silhouette's concavities.
const MASK_MAX_CELLS = 110

// A pixel counts as "ink" when its alpha is above this (anti-aliased edges of
// real artwork sit well above it; fully transparent padding is 0).
const ALPHA_INK_THRESHOLD = 12

// If (almost) every pixel is fully opaque we treat the file as having no usable
// alpha channel (e.g. a flattened JPEG) and fall back to a rectangle mask.
const ALPHA_PRESENT_THRESHOLD = 250

interface DecodedSize {
  width: number
  height: number
}

type Drawable = CanvasImageSource & DecodedSize

/**
 * Finds the tight bounding box of non-transparent pixels AND a low-resolution
 * occupancy mask of the real artwork silhouette, so the packer can both size
 * the art by its visible content and nest arts into each other's empty space.
 * Falls back to the full image / a rectangle mask when nothing is detected.
 */
export async function computeArtGeometry(file: File): Promise<ArtGeometry> {
  const source = await decode(file)
  try {
    return scan(source)
  } finally {
    if ('close' in source && typeof source.close === 'function') source.close()
  }
}

/** Back-compat helper: bounding box only. */
export async function computeContentBox(file: File): Promise<ContentBox> {
  return (await computeArtGeometry(file)).box
}

async function decode(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      return (await createImageBitmap(file)) as Drawable
    } catch {
      // Fall through to the <img> path below.
    }
  }
  return decodeViaImage(file)
}

function decodeViaImage(file: File): Promise<Drawable> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(
        Object.assign(img, {
          width: img.naturalWidth,
          height: img.naturalHeight,
        }) as unknown as Drawable
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Falha ao decodificar imagem.'))
    }
    img.src = url
  })
}

function scan(source: Drawable): ArtGeometry {
  const naturalWidthPx = source.width
  const naturalHeightPx = source.height

  const scale = Math.min(1, SCAN_MAX_SIDE / Math.max(naturalWidthPx, naturalHeightPx))
  const scanWidth = Math.max(1, Math.round(naturalWidthPx * scale))
  const scanHeight = Math.max(1, Math.round(naturalHeightPx * scale))

  const canvas = document.createElement('canvas')
  canvas.width = scanWidth
  canvas.height = scanHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return fallback(naturalWidthPx, naturalHeightPx)
  ctx.drawImage(source, 0, 0, scanWidth, scanHeight)

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, scanWidth, scanHeight).data
  } catch {
    return fallback(naturalWidthPx, naturalHeightPx)
  }

  // Detect whether the file actually carries transparency.
  let hasAlpha = false
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < ALPHA_PRESENT_THRESHOLD) {
      hasAlpha = true
      break
    }
  }

  const inkAt = (x: number, y: number): boolean => {
    const idx = (y * scanWidth + x) * 4
    if (hasAlpha) return data[idx + 3] > ALPHA_INK_THRESHOLD
    // No alpha: treat near-white as background so bounding box still trims, but
    // the mask stays a rectangle (see below) — we never nest into a "white" gap.
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]
    return !(r > 244 && g > 244 && b > 244)
  }

  let minX = scanWidth
  let minY = scanHeight
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < scanHeight; y++) {
    for (let x = 0; x < scanWidth; x++) {
      if (inkAt(x, y)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) return fallback(naturalWidthPx, naturalHeightPx)

  const invScale = 1 / scale
  const box: ContentBox = {
    xPx: Math.max(0, Math.floor(minX * invScale)),
    yPx: Math.max(0, Math.floor(minY * invScale)),
    widthPx: Math.min(naturalWidthPx, Math.ceil((maxX - minX + 1) * invScale)),
    heightPx: Math.min(naturalHeightPx, Math.ceil((maxY - minY + 1) * invScale)),
    naturalWidthPx,
    naturalHeightPx,
  }

  const mask = buildMask(inkAt, hasAlpha, minX, minY, maxX, maxY)
  return { box, mask }
}

/**
 * Builds the normalized occupancy mask by sampling the scan buffer over the
 * content box. For files without alpha we emit a solid rectangle so the packer
 * never assumes a printed (white) region is empty space.
 */
function buildMask(
  inkAt: (x: number, y: number) => boolean,
  hasAlpha: boolean,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): ArtMask {
  const contentW = maxX - minX + 1
  const contentH = maxY - minY + 1
  const longSide = Math.max(contentW, contentH)
  const cells = Math.min(MASK_MAX_CELLS, longSide)
  const cols = Math.max(1, Math.round((contentW / longSide) * cells))
  const rows = Math.max(1, Math.round((contentH / longSide) * cells))
  const data = new Uint8Array(cols * rows)

  if (!hasAlpha) {
    data.fill(1)
    return { cols, rows, data, hasAlpha }
  }

  for (let r = 0; r < rows; r++) {
    const y0 = minY + Math.floor((r / rows) * contentH)
    const y1 = Math.max(y0 + 1, minY + Math.ceil(((r + 1) / rows) * contentH))
    for (let c = 0; c < cols; c++) {
      const x0 = minX + Math.floor((c / cols) * contentW)
      const x1 = Math.max(x0 + 1, minX + Math.ceil(((c + 1) / cols) * contentW))
      let occupied = 0
      outer: for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (inkAt(x, y)) {
            occupied = 1
            break outer
          }
        }
      }
      data[r * cols + c] = occupied
    }
  }
  return { cols, rows, data, hasAlpha }
}

function fallback(naturalWidthPx: number, naturalHeightPx: number): ArtGeometry {
  return {
    box: {
      xPx: 0,
      yPx: 0,
      widthPx: naturalWidthPx,
      heightPx: naturalHeightPx,
      naturalWidthPx,
      naturalHeightPx,
    },
    mask: { cols: 1, rows: 1, data: new Uint8Array([1]), hasAlpha: false },
  }
}
