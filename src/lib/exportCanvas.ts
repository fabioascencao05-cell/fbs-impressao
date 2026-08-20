import * as fabric from 'fabric'
import JSZip from 'jszip'
import { rotatedAabbCm } from './geometry'
import { EXPORT_PX_PER_CM } from './constants'
import type { PackedPage } from '@/types'

const EXPORT_DPI = 300
const MAX_EXPORT_DIMENSION_PX = 32_767
const MAX_EXPORT_PIXELS = 100_000_000

function usedHeightCm(page: PackedPage) {
  return page.items.reduce((max, item) => {
    const box = rotatedAabbCm(item.widthCm, item.heightCm, item.angle ?? 0)
    return Math.max(max, item.yCm + box.hCm)
  }, 0)
}

function assertSafeExportSize(widthPx: number, heightPx: number) {
  if (!Number.isSafeInteger(widthPx) || !Number.isSafeInteger(heightPx) || widthPx < 1 || heightPx < 1) {
    throw new Error('As dimensões da exportação são inválidas.')
  }
  if (
    widthPx > MAX_EXPORT_DIMENSION_PX ||
    heightPx > MAX_EXPORT_DIMENSION_PX ||
    widthPx * heightPx > MAX_EXPORT_PIXELS
  ) {
    throw new Error(
      'A folha usada é grande demais para exportar com segurança a 300 DPI. Reduza a largura ou divida o layout em mais páginas.'
    )
  }
}

async function renderPageToBlob(
  page: PackedPage,
  canvasWidthCm: number,
  maxHeightCm: number
): Promise<Blob> {
  if (!Number.isFinite(canvasWidthCm) || canvasWidthCm <= 0 || !Number.isFinite(maxHeightCm) || maxHeightCm <= 0) {
    throw new Error('A largura e a altura máxima da folha devem ser maiores que zero.')
  }

  const widthPx = Math.round(canvasWidthCm * EXPORT_PX_PER_CM)
  const heightPx = Math.max(1, Math.ceil(usedHeightCm(page) * EXPORT_PX_PER_CM))
  assertSafeExportSize(widthPx, heightPx)

  const canvasEl = document.createElement('canvas')
  canvasEl.width = widthPx
  canvasEl.height = heightPx

  const staticCanvas = new fabric.StaticCanvas(canvasEl, {
    width: widthPx,
    height: heightPx,
    backgroundColor: undefined, // transparent background
  })

  try {
    const images = await Promise.all(page.items.map(async (item) => {
      if (
        !item.previewUrl ||
        !Number.isFinite(item.xCm) ||
        !Number.isFinite(item.yCm) ||
        !Number.isFinite(item.widthCm) ||
        !Number.isFinite(item.heightCm) ||
        !Number.isFinite(item.contentWidthPx) ||
        !Number.isFinite(item.contentHeightPx) ||
        item.widthCm <= 0 ||
        item.heightCm <= 0 ||
        item.contentWidthPx <= 0 ||
        item.contentHeightPx <= 0
      ) {
        throw new Error('O layout contém uma imagem com dimensões inválidas.')
      }

      let img: fabric.FabricImage
      try {
        img = await fabric.FabricImage.fromURL(item.previewUrl, { crossOrigin: 'anonymous' })
      } catch {
        throw new Error('Não foi possível carregar uma das imagens para exportação.')
      }

      // Crop to the content box and use a centre origin, exactly like the
      // on-screen editor (CanvasPage), so the exported PNG matches it.
      const scale = (item.widthCm * EXPORT_PX_PER_CM) / item.contentWidthPx
      const box = rotatedAabbCm(item.widthCm, item.heightCm, item.angle ?? 0)
      img.set({
        cropX: item.contentXPx,
        cropY: item.contentYPx,
        width: item.contentWidthPx,
        height: item.contentHeightPx,
        originX: 'center',
        originY: 'center',
        left: (item.xCm + box.wCm / 2) * EXPORT_PX_PER_CM,
        top: (item.yCm + box.hCm / 2) * EXPORT_PX_PER_CM,
        angle: item.angle ?? 0,
        scaleX: scale,
        scaleY: scale,
        selectable: false,
      })
      return img
    }))
    images.forEach((img) => staticCanvas.add(img))

    staticCanvas.renderAll()
    const png = await new Promise<Blob>((resolve, reject) => {
      canvasEl.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Falha ao gerar PNG do canvas.'))
      }, 'image/png')
    })
    const { changeDpiBlob } = await import('changedpi')
    return await changeDpiBlob(png, EXPORT_DPI)
  } finally {
    staticCanvas.dispose()
  }
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
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
