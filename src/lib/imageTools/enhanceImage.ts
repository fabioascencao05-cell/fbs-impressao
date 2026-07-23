// "Melhorar / preparar para 300 DPI": high-quality upscale via Lanczos
// resampling (pica) plus an unsharp pass, then stamps 300 DPI metadata into the
// PNG. This is honest resampling — it enlarges cleanly and sharpens, but does
// not invent detail (that would need AI super-resolution, an optional paid step
// documented separately). Runs fully in the browser.

import { loadImageFromBlob, canvasToBlob } from './imageUtils'

export interface EnhanceOptions {
  /** Upscale factor applied to the current pixel dimensions (e.g. 2 or 4). */
  scale: number
  /** Whether to apply an unsharp mask for extra crispness. Default true. */
  sharpen?: boolean
}

const MAX_SIDE_PX = 12000 // guard against absurd canvases that would crash the tab

export async function enhanceImage(input: Blob, options: EnhanceOptions): Promise<Blob> {
  const { default: Pica } = await import('pica')
  const { changeDpiBlob } = await import('changedpi')

  const img = await loadImageFromBlob(input)

  const from = document.createElement('canvas')
  from.width = img.naturalWidth
  from.height = img.naturalHeight
  const fctx = from.getContext('2d')
  if (!fctx) throw new Error('Canvas 2D indisponível neste navegador.')
  fctx.drawImage(img, 0, 0)

  // Apply the requested factor, but cap the LONGEST side to MAX_SIDE_PX with a
  // single uniform scale so the aspect ratio is preserved (clamping each axis
  // independently would stretch non-square art).
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  const scale = Math.min(options.scale, MAX_SIDE_PX / longest)
  const targetW = Math.max(1, Math.round(img.naturalWidth * scale))
  const targetH = Math.max(1, Math.round(img.naturalHeight * scale))

  const to = document.createElement('canvas')
  to.width = targetW
  to.height = targetH

  const pica = Pica()
  await pica.resize(from, to, {
    unsharpAmount: options.sharpen === false ? 0 : 80,
    unsharpRadius: 0.6,
    unsharpThreshold: 2,
  })

  const png = await canvasToBlob(to, 'image/png')
  // Stamp 300 DPI so print software reads the intended physical size.
  return changeDpiBlob(png, 300)
}
