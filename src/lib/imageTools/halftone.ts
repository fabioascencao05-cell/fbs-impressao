// Halftone renderer for DTF artwork. It keeps the source dimensions (within
// safe browser limits), preserves transparent pixels and exports a real PNG.
// A lightweight SVG of the dots is also available for one-colour screens.

import { canvasToBlob, loadImageFromBlob } from './imageUtils'

export type HalftoneMode = 'mono' | 'cmyk'

export interface HalftoneOptions {
  mode: HalftoneMode
  /** Diameter of a fully filled dot, in source-image pixels. */
  dotSize: number
  /** Distance between dot centres, in source-image pixels. */
  spacing: number
  /** Base screen angle in degrees. CMYK uses the traditional offset screens. */
  angle: number
  /** Ink coverage multiplier expressed as a percentage. */
  intensity: number
  /** Ink colour used by the one-colour screen. */
  color: string
}

export interface HalftoneResult {
  blob: Blob
  width: number
  height: number
  /** SVG circles are intentionally limited to practical, editable files. */
  svg: string | null
  dotCount: number
  capped: boolean
}

export interface HalftoneDimensions {
  width: number
  height: number
  scale: number
  capped: boolean
}

export interface CmykChannels {
  c: number
  m: number
  y: number
  k: number
}

const MAX_SIDE_PX = 12_000
const MAX_OUTPUT_PIXELS = 48_000_000
export const MAX_HALFTONE_SVG_DOTS = 20_000
const MAX_GRID_DOTS_PER_SCREEN = 250_000

const CMYK_SCREENS = [
  { color: '#00a9e0', channel: 'c' as const, offset: 15 },
  { color: '#ec1d7a', channel: 'm' as const, offset: 75 },
  { color: '#f6d20a', channel: 'y' as const, offset: 0 },
  { color: '#16181d', channel: 'k' as const, offset: 45 },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function cleanNumber(value: number, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? clamp(value, min, max) : fallback
}

function hexToRgb(value: string) {
  const hex = value.trim().replace('#', '')
  const compact = hex.length === 3 ? hex.split('').map((part) => `${part}${part}`).join('') : hex
  const parsed = Number.parseInt(compact, 16)
  if (!/^[\da-f]{6}$/i.test(compact) || Number.isNaN(parsed)) return { r: 22, g: 24, b: 29 }
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 }
}

function rgbaAt(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const safeX = clamp(Math.round(x), 0, width - 1)
  const safeY = clamp(Math.round(y), 0, height - 1)
  const offset = (safeY * width + safeX) * 4
  return {
    r: data[offset],
    g: data[offset + 1],
    b: data[offset + 2],
    a: data[offset + 3],
  }
}

function dotRadius(ink: number, maxRadius: number) {
  // The square root makes dot *area* proportional to the ink value, as a
  // physical halftone screen does. Small values are skipped instead of making
  // a fuzzy pepper-like residue around transparent DTF artwork.
  return maxRadius * Math.sqrt(clamp(ink, 0, 1))
}

function normalizeHex(value: string) {
  const { r, g, b } = hexToRgb(value)
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** Keeps output dimensions proportional while protecting the browser canvas. */
export function getHalftoneDimensions(width: number, height: number): HalftoneDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('A imagem não tem dimensões válidas para criar o halftone.')
  }
  const bySide = MAX_SIDE_PX / Math.max(width, height)
  const byPixels = Math.sqrt(MAX_OUTPUT_PIXELS / (width * height))
  const scale = Math.min(1, bySide, byPixels)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
    capped: scale < 0.999,
  }
}

/** RGB -> CMYK channels normalized to 0..1, useful for a visual CMYK screen. */
export function cmykFromRgb(r: number, g: number, b: number): CmykChannels {
  const red = clamp(r, 0, 255) / 255
  const green = clamp(g, 0, 255) / 255
  const blue = clamp(b, 0, 255) / 255
  const k = 1 - Math.max(red, green, blue)
  if (k >= 0.999999) return { c: 0, m: 0, y: 0, k: 1 }
  const denominator = 1 - k
  return {
    c: (1 - red - k) / denominator,
    m: (1 - green - k) / denominator,
    y: (1 - blue - k) / denominator,
    k,
  }
}

export function canExportHalftoneSvg(mode: HalftoneMode, dotCount: number) {
  return mode === 'mono' && dotCount > 0 && dotCount <= MAX_HALFTONE_SVG_DOTS
}

/** Minimum spacing that keeps a large image responsive in the browser. */
export function getMinimumHalftoneSpacing(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return 4
  // renderGrid covers the diagonal square before discarding points outside the
  // artwork, so use its candidate area instead of the simple image area.
  return Math.max(4, Math.ceil(Math.sqrt((width * width + height * height) / MAX_GRID_DOTS_PER_SCREEN)))
}

function svgDocument(width: number, height: number, color: string, circles: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"><g fill="${color}">${circles.join('')}</g></svg>`
}

interface RenderGridOptions {
  width: number
  height: number
  spacing: number
  angle: number
  draw: (x: number, y: number) => void
}

function renderGrid({ width, height, spacing, angle, draw }: RenderGridOptions) {
  const radians = (angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const centerX = width / 2
  const centerY = height / 2
  const halfDiagonal = Math.ceil(Math.hypot(width, height) / 2) + spacing

  for (let gridY = -halfDiagonal; gridY <= halfDiagonal; gridY += spacing) {
    for (let gridX = -halfDiagonal; gridX <= halfDiagonal; gridX += spacing) {
      const x = centerX + gridX * cos - gridY * sin
      const y = centerY + gridX * sin + gridY * cos
      if (x < 0 || x >= width || y < 0 || y >= height) continue
      draw(x, y)
    }
  }
}

/**
 * Turns the current Studio image into transparent dot artwork. The CMYK option
 * is a visual four-screen effect; PNG is necessarily RGB, so the RIP remains
 * responsible for its final ICC / ink separation.
 */
export async function createHalftone(input: Blob, options: HalftoneOptions): Promise<HalftoneResult> {
  const image = await loadImageFromBlob(input)
  const dimensions = getHalftoneDimensions(image.naturalWidth, image.naturalHeight)
  const source = document.createElement('canvas')
  source.width = dimensions.width
  source.height = dimensions.height
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('Canvas 2D indisponível neste navegador.')
  sourceContext.imageSmoothingEnabled = true
  sourceContext.imageSmoothingQuality = 'high'
  sourceContext.drawImage(image, 0, 0, dimensions.width, dimensions.height)
  const pixels = sourceContext.getImageData(0, 0, dimensions.width, dimensions.height).data

  const output = document.createElement('canvas')
  output.width = dimensions.width
  output.height = dimensions.height
  const context = output.getContext('2d', { alpha: true })
  if (!context) throw new Error('Canvas 2D indisponível neste navegador.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  const dotSize = cleanNumber(options.dotSize, 12, 2, 96)
  const spacing = cleanNumber(options.spacing, 18, 3, 160)
  const angle = cleanNumber(options.angle, 45, -360, 360)
  const intensity = cleanNumber(options.intensity, 100, 5, 200) / 100
  const maxRadius = Math.min(dotSize / 2, spacing / 2)
  const monoColor = normalizeHex(options.color)
  const minimumSpacing = getMinimumHalftoneSpacing(dimensions.width, dimensions.height)
  if (spacing < minimumSpacing) {
    throw new Error(`Para esta arte, use espaçamento de pelo menos ${minimumSpacing}px. Isso evita travamento e mantém os pontos nítidos.`)
  }
  let dotCount = 0
  const svgCircles: string[] = []

  const paintDot = (x: number, y: number, radius: number, color: string, writeSvg = false) => {
    if (radius < 0.35) return
    dotCount += 1
    context.fillStyle = color
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
    if (writeSvg && dotCount <= MAX_HALFTONE_SVG_DOTS) {
      svgCircles.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius.toFixed(2)}"/>`)
    }
  }

  if (options.mode === 'cmyk') {
    for (const screen of CMYK_SCREENS) {
      renderGrid({
        width: dimensions.width,
        height: dimensions.height,
        spacing,
        angle: angle + screen.offset,
        draw: (x, y) => {
          const rgba = rgbaAt(pixels, dimensions.width, dimensions.height, x, y)
          if (rgba.a === 0) return
          const cmyk = cmykFromRgb(rgba.r, rgba.g, rgba.b)
          const ink = cmyk[screen.channel] * (rgba.a / 255) * intensity
          paintDot(x, y, dotRadius(ink, maxRadius), screen.color)
        },
      })
    }
  } else {
    renderGrid({
      width: dimensions.width,
      height: dimensions.height,
      spacing,
      angle,
      draw: (x, y) => {
        const rgba = rgbaAt(pixels, dimensions.width, dimensions.height, x, y)
        if (rgba.a === 0) return
        const luminance = (0.2126 * rgba.r + 0.7152 * rgba.g + 0.0722 * rgba.b) / 255
        const ink = (1 - luminance) * (rgba.a / 255) * intensity
        paintDot(x, y, dotRadius(ink, maxRadius), monoColor, true)
      },
    })
  }

  if (dotCount === 0) {
    throw new Error('A arte não gerou pontos visíveis. Tente aumentar a intensidade ou usar uma imagem mais escura.')
  }

  // Stamp the print-density metadata without resampling the dots. RIPs still
  // use the actual pixel dimensions, but Corel and common print workflows will
  // open the PNG at the expected 300 DPI size.
  const { changeDpiBlob } = await import('changedpi')
  const png = await changeDpiBlob(await canvasToBlob(output, 'image/png'), 300)

  return {
    blob: png,
    width: dimensions.width,
    height: dimensions.height,
    svg: canExportHalftoneSvg(options.mode, dotCount)
      ? svgDocument(dimensions.width, dimensions.height, monoColor, svgCircles)
      : null,
    dotCount,
    capped: dimensions.capped,
  }
}
