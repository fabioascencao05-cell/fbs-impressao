// "Melhorar / preparar para 300 DPI": high-quality resampling with Pica's
// mks2013 filter. It keeps the original proportion and transparent pixels
// intact; it improves edges for printing but deliberately does not invent
// detail that is not present in the uploaded artwork.

import { loadImageFromBlob, canvasToBlob } from './imageUtils'

export interface EnhanceOptions {
  /** Upscale factor applied to the current pixel dimensions (e.g. 2 or 4). */
  scale: number
  /** Balanced is safer for photos; crisp gives text and logos a little more edge definition. */
  profile?: EnhanceProfile
}

export type EnhanceProfile = 'balanced' | 'crisp'

export interface EnhanceResult {
  blob: Blob
  width: number
  height: number
  /** The factor actually applied after the browser-safety limits. */
  appliedScale: number
  capped: boolean
}

const MAX_SIDE_PX = 12_000
const MAX_OUTPUT_PIXELS = 48_000_000

/** Calculates a uniform, browser-safe target size without ever stretching the art. */
export function getEnhanceDimensions(width: number, height: number, requestedScale: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('A imagem não tem dimensões válidas para melhorar.')
  }

  const cleanScale = Number.isFinite(requestedScale) ? Math.max(1, requestedScale) : 1
  const bySide = MAX_SIDE_PX / Math.max(width, height)
  const byPixels = Math.sqrt(MAX_OUTPUT_PIXELS / (width * height))
  const appliedScale = Math.min(cleanScale, bySide, byPixels)
  const targetWidth = Math.max(1, Math.round(width * appliedScale))
  const targetHeight = Math.max(1, Math.round(height * appliedScale))

  return {
    width: targetWidth,
    height: targetHeight,
    appliedScale,
    capped: appliedScale + 0.001 < cleanScale,
  }
}

export async function enhanceImage(input: Blob, options: EnhanceOptions): Promise<EnhanceResult> {
  const { default: Pica } = await import('pica')
  const { changeDpiBlob } = await import('changedpi')

  const img = await loadImageFromBlob(input)

  const from = document.createElement('canvas')
  from.width = img.naturalWidth
  from.height = img.naturalHeight
  const fctx = from.getContext('2d')
  if (!fctx) throw new Error('Canvas 2D indisponível neste navegador.')
  fctx.drawImage(img, 0, 0)

  const target = getEnhanceDimensions(img.naturalWidth, img.naturalHeight, options.scale)

  const to = document.createElement('canvas')
  to.width = target.width
  to.height = target.height

  const pica = Pica()
  const crisp = options.profile === 'crisp'
  await pica.resize(from, to, {
    // mks2013 is Pica's recommended production filter. A small optional
    // unsharp pass improves letters without producing the white halos that an
    // aggressive sharpen can create around transparent DTF artwork.
    filter: 'mks2013',
    unsharpAmount: crisp ? 75 : 35,
    unsharpRadius: 0.6,
    unsharpThreshold: crisp ? 3 : 5,
  })

  const png = await canvasToBlob(to, 'image/png')
  return {
    blob: await changeDpiBlob(png, 300),
    width: target.width,
    height: target.height,
    appliedScale: target.appliedScale,
    capped: target.capped,
  }
}
