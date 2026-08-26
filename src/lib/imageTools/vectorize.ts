// Raster → SVG tracing for the Studio. This is intentionally designed for
// logos, lettering and flat illustrations — not photographs. The original
// proportion is always retained and the resulting SVG has no artificial
// strokes around each path, which prevents the "engordar" effect in Corel and
// in the DTF export.

import { blobToImageData, loadImageFromBlob, canvasToBlob } from './imageUtils'

export type VectorizePreset = 'logo' | 'detailed' | 'mono'
export type VectorizeFidelity = 'balanced' | 'high'

export interface VectorizeOptions {
  preset?: VectorizePreset
  fidelity?: VectorizeFidelity
}

export interface TracePlan {
  sourceWidth: number
  sourceHeight: number
  traceWidth: number
  traceHeight: number
  coordinateScale: number
}

export interface VectorizeResult {
  svg: string
  pathCount: number
  tracePlan: TracePlan
}

const MAX_TRACE_PIXELS = 3_200_000
const MAX_TRACE_SIDE = 2_400
const MIN_HIGH_FIDELITY_SIDE = 1_800
const MIN_BALANCED_SIDE = 1_200

/**
 * Plans the tracing canvas at a useful resolution while keeping memory under
 * control. Coordinates are scaled back to the original art, so the SVG keeps
 * its natural aspect ratio and never stretches the design.
 */
export function getTracePlan(width: number, height: number, fidelity: VectorizeFidelity = 'high'): TracePlan {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('A imagem não tem dimensões válidas para vetorização.')
  }

  const longest = Math.max(width, height)
  const minTraceSide = fidelity === 'high' ? MIN_HIGH_FIDELITY_SIDE : MIN_BALANCED_SIDE
  const desiredScale = Math.min(MAX_TRACE_SIDE, Math.max(minTraceSide, longest)) / longest
  const maxPixelScale = Math.sqrt(MAX_TRACE_PIXELS / (width * height))
  const traceScale = Math.min(desiredScale, maxPixelScale)
  const traceWidth = Math.max(1, Math.round(width * traceScale))
  const traceHeight = Math.max(1, Math.round(height * traceScale))

  return {
    sourceWidth: width,
    sourceHeight: height,
    traceWidth,
    traceHeight,
    // Use the original uniform calculation (instead of either rounded axis)
    // so width and height are scaled by the same factor.
    coordinateScale: 1 / traceScale,
  }
}

/** ImageTracer configuration with fidelity favoured over tiny SVG files. */
export function getVectorizeOptions(
  preset: VectorizePreset = 'logo',
  fidelity: VectorizeFidelity = 'high',
  coordinateScale = 1
): Record<string, unknown> {
  const high = fidelity === 'high'
  const common = {
    colorsampling: 2,
    mincolorratio: 0,
    colorquantcycles: high ? 5 : 4,
    // A zero-width stroke is vital: ImageTracer otherwise puts a 1px outline
    // on every path, visibly changing thin letters and logos.
    strokewidth: 0,
    scale: coordinateScale,
    viewbox: true,
    desc: false,
    roundcoords: high ? 2 : 1,
    layering: 0,
    blurradius: 0,
    blurdelta: 20,
  }

  switch (preset) {
    case 'detailed':
      return {
        ...common,
        numberofcolors: high ? 64 : 40,
        pathomit: 0,
        ltres: high ? 0.18 : 0.38,
        qtres: high ? 0.18 : 0.38,
        rightangleenhance: false,
        linefilter: false,
      }
    case 'mono':
      return {
        ...common,
        numberofcolors: 2,
        pathomit: high ? 0 : 1,
        ltres: high ? 0.12 : 0.3,
        qtres: high ? 0.12 : 0.3,
        rightangleenhance: true,
        linefilter: high,
      }
    default:
      return {
        ...common,
        numberofcolors: high ? 32 : 20,
        pathomit: high ? 1 : 3,
        ltres: high ? 0.22 : 0.45,
        qtres: high ? 0.22 : 0.45,
        rightangleenhance: true,
        linefilter: false,
      }
  }
}

function normalizeTransparentPixels(imageData: ImageData): ImageData {
  const pixels = new Uint8ClampedArray(imageData.data)
  for (let index = 0; index < pixels.length; index += 4) {
    // Transparent pixels can keep arbitrary RGB values after background
    // removal. Clearing those values prevents invisible colour layers and
    // bloated SVGs without altering any visible edge.
    if (pixels[index + 3] === 0) {
      pixels[index] = 0
      pixels[index + 1] = 0
      pixels[index + 2] = 0
    }
  }
  return new ImageData(pixels, imageData.width, imageData.height)
}

async function prepareImageData(source: ImageData, plan: TracePlan): Promise<ImageData> {
  const normalizedSource = normalizeTransparentPixels(source)
  if (normalizedSource.width === plan.traceWidth && normalizedSource.height === plan.traceHeight) return normalizedSource

  const { default: Pica } = await import('pica')
  const from = document.createElement('canvas')
  from.width = normalizedSource.width
  from.height = normalizedSource.height
  const sourceContext = from.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('Canvas 2D indisponível neste navegador.')
  sourceContext.putImageData(normalizedSource, 0, 0)

  const to = document.createElement('canvas')
  to.width = plan.traceWidth
  to.height = plan.traceHeight
  await Pica().resize(from, to, { filter: 'mks2013', unsharpAmount: 0 })

  const targetContext = to.getContext('2d', { willReadFrequently: true })
  if (!targetContext) throw new Error('Canvas 2D indisponível neste navegador.')
  return normalizeTransparentPixels(targetContext.getImageData(0, 0, to.width, to.height))
}

/**
 * Removes invisible trace paths and wraps the output in a stable SVG viewport.
 * `preserveAspectRatio="xMidYMid meet"` is explicit so Corel and browsers never
 * stretch the vector when it is placed at another size.
 */
export function finalizeSvg(svg: string, sourceWidth: number, sourceHeight: number): string {
  const body = svg
    .replace(/^\s*<svg\b[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .replace(/<path\b(?=[^>]*\bopacity="0(?:\.0+)?")[^>]*\/>/gi, '')
    .replace(/\s+stroke="[^"]*"/gi, '')
    .replace(/\s+stroke-width="0(?:\.0+)?"/gi, '')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sourceWidth}" height="${sourceHeight}" viewBox="0 0 ${sourceWidth} ${sourceHeight}" preserveAspectRatio="xMidYMid meet" version="1.1" data-fbs-vector="true">${body}</svg>`
}

/** Traces a raster blob into a clean, proportion-preserving SVG. */
export async function vectorizeToSvg(input: Blob, options: VectorizeOptions = {}): Promise<VectorizeResult> {
  const preset = options.preset ?? 'logo'
  const fidelity = options.fidelity ?? 'high'
  const source = await blobToImageData(input)
  const plan = getTracePlan(source.width, source.height, fidelity)
  // Avoid decoding the input twice when no resize/normalisation is needed.
  const imageData = plan.traceWidth === source.width && plan.traceHeight === source.height
    ? normalizeTransparentPixels(source)
    : await prepareImageData(source, plan)

  const { default: ImageTracer } = await import('imagetracerjs')
  const rawSvg = ImageTracer.imagedataToSVG(imageData, getVectorizeOptions(preset, fidelity, plan.coordinateScale))
  const svg = finalizeSvg(rawSvg, plan.sourceWidth, plan.sourceHeight)
  const pathCount = (svg.match(/<path\b/gi) ?? []).length

  if (pathCount === 0) {
    throw new Error('Não foi possível encontrar formas para vetorizar. Tente remover o fundo ou use a imagem original em PNG.')
  }

  return { svg, pathCount, tracePlan: plan }
}

/**
 * Rasterizes an SVG string to a transparent PNG at a target pixel width. This
 * is only the Studio preview/download; when sent to the gang sheet the SVG is
 * preserved and drawn directly at the final 300 DPI output size.
 */
export async function svgToPngBlob(svg: string, targetWidthPx = 2_000): Promise<Blob> {
  const { changeDpiBlob } = await import('changedpi')
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const img = await loadImageFromBlob(svgBlob)
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('Não foi possível preparar o SVG para visualização.')

  const ratio = img.naturalHeight / img.naturalWidth
  const requestedWidth = Math.max(1, Math.round(targetWidthPx))
  const bySide = 12_000 / Math.max(requestedWidth, requestedWidth * ratio)
  const byPixels = Math.sqrt(48_000_000 / (requestedWidth * requestedWidth * ratio))
  const scale = Math.min(1, bySide, byPixels)
  const width = Math.max(1, Math.round(requestedWidth * scale))
  const height = Math.max(1, Math.round(width * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)

  const png = await canvasToBlob(canvas, 'image/png')
  return changeDpiBlob(png, 300)
}
