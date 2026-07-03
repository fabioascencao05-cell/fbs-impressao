import * as fabric from 'fabric'
import JSZip from 'jszip'
import { EXPORT_PX_PER_CM } from './constants'
import type { PackedPage } from '@/types'

async function renderPageToBlob(
  page: PackedPage,
  canvasWidthCm: number,
  maxHeightCm: number
): Promise<Blob> {
  const widthPx = Math.round(canvasWidthCm * EXPORT_PX_PER_CM)
  const heightPx = Math.round(maxHeightCm * EXPORT_PX_PER_CM)

  const canvasEl = document.createElement('canvas')
  canvasEl.width = widthPx
  canvasEl.height = heightPx

  const staticCanvas = new fabric.StaticCanvas(canvasEl, {
    width: widthPx,
    height: heightPx,
    backgroundColor: undefined, // transparent background
  })

  await Promise.all(
    page.items.map(
      (item) =>
        new Promise<void>((resolve, reject) => {
          fabric.FabricImage.fromURL(item.previewUrl, { crossOrigin: 'anonymous' })
            .then((img) => {
              // item.xCm/yCm/widthCm/heightCm describe the visible content box,
              // not the whole (possibly padded) file — scale/position the full
              // image so its content box lands exactly on that rect, matching
              // the on-screen editor pixel for pixel.
              const scale = (item.widthCm * EXPORT_PX_PER_CM) / item.contentWidthPx
              const left = item.xCm * EXPORT_PX_PER_CM - item.contentXPx * scale
              const top = item.yCm * EXPORT_PX_PER_CM - item.contentYPx * scale
              img.set({
                left,
                top,
                originX: 'left',
                originY: 'top',
                angle: item.angle ?? 0,
                scaleX: scale,
                scaleY: scale,
                selectable: false,
              })
              staticCanvas.add(img)
              resolve()
            })
            .catch(reject)
        })
    )
  )

  staticCanvas.renderAll()

  return new Promise<Blob>((resolve, reject) => {
    canvasEl.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Falha ao gerar PNG do canvas.'))
      staticCanvas.dispose()
    }, 'image/png')
  })
}

/**
 * Renders every packed page at true 300 DPI (EXPORT_PX_PER_CM) with a
 * transparent background and triggers a download. Multiple pages are
 * bundled into a single ZIP; a single page downloads directly as PNG.
 */
export async function downloadGangSheets(
  pages: PackedPage[],
  canvasWidthCm: number,
  maxHeightCm: number
) {
  const nonEmptyPages = pages.filter((p) => p.items.length > 0)
  if (nonEmptyPages.length === 0) return

  if (nonEmptyPages.length === 1) {
    const blob = await renderPageToBlob(nonEmptyPages[0], canvasWidthCm, maxHeightCm)
    triggerDownload(blob, 'gang-sheet-dtf.png')
    return
  }

  const zip = new JSZip()
  for (const page of nonEmptyPages) {
    const blob = await renderPageToBlob(page, canvasWidthCm, maxHeightCm)
    zip.file(`gang-sheet-dtf-pagina-${page.index + 1}.png`, blob)
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  triggerDownload(zipBlob, 'gang-sheets-dtf.zip')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
