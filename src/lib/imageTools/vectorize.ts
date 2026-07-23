// Vectorization (raster → SVG) that runs in the browser via ImageTracer.
// Produces a resolution-independent SVG for editing/cutting in CorelDRAW, plus
// a helper to rasterize that SVG back to a crisp 300 DPI PNG for DTF printing.

import { blobToImageData, loadImageFromBlob, canvasToBlob } from './imageUtils'

export type VectorizePreset = 'logo' | 'detailed' | 'mono'

const PRESETS: Record<VectorizePreset, Record<string, unknown>> = {
  // Flat art / logos: few colours, clean paths.
  logo: { numberofcolors: 16, colorquantcycles: 3, pathomit: 8, ltres: 1, qtres: 1, blurradius: 0 },
  // Richer art: more colours, tighter tracing.
  detailed: { numberofcolors: 32, colorquantcycles: 3, pathomit: 4, ltres: 0.5, qtres: 0.5, blurradius: 0 },
  // Single-colour / line art: 2 colours for a crisp silhouette.
  mono: { numberofcolors: 2, colorquantcycles: 3, pathomit: 8, ltres: 1, qtres: 1, blurradius: 0 },
}

/** Traces a raster blob into an SVG string. */
export async function vectorizeToSvg(input: Blob, preset: VectorizePreset = 'logo'): Promise<string> {
  const { default: ImageTracer } = await import('imagetracerjs')
  const imageData = await blobToImageData(input)
  return ImageTracer.imagedataToSVG(imageData, PRESETS[preset])
}

/**
 * Rasterizes an SVG string to a PNG at a target pixel width (keeping aspect),
 * with 300 DPI metadata — used when a vectorized art is sent to the gang sheet,
 * which prints from raster. `targetWidthPx` defaults to a generous 2000px.
 */
export async function svgToPngBlob(svg: string, targetWidthPx = 2000): Promise<Blob> {
  const { changeDpiBlob } = await import('changedpi')
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const img = await loadImageFromBlob(svgBlob)

  const ratio = img.naturalHeight / img.naturalWidth || 1
  const width = Math.max(1, Math.round(targetWidthPx))
  const height = Math.max(1, Math.round(width * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.')
  ctx.drawImage(img, 0, 0, width, height)

  const png = await canvasToBlob(canvas, 'image/png')
  return changeDpiBlob(png, 300)
}
