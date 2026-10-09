import JSZip from 'jszip'
import { planUsefulExport } from './exportPlan'
import { encodeRgbaPng } from './pngWriter'
import { rotatedAabbCm } from './geometry'
import { validateLayout } from './layoutValidation'
import type { PackedPage, PlacedItem } from '@/types'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível carregar uma arte para a exportação.'))
    image.src = url
  })
}

function drawItem(ctx: CanvasRenderingContext2D, item: PlacedItem, image: HTMLImageElement, pxPerCm: number): void {
  const scale = (item.widthCm * pxPerCm) / item.contentWidthPx
  const box = rotatedAabbCm(item.widthCm, item.heightCm, item.angle ?? 0)
  const widthPx = item.contentWidthPx * scale
  const heightPx = item.contentHeightPx * scale

  ctx.save()
  ctx.translate((item.xCm + box.wCm / 2) * pxPerCm, (item.yCm + box.hCm / 2) * pxPerCm)
  ctx.rotate(((item.angle ?? 0) * Math.PI) / 180)
  ctx.drawImage(image, item.contentXPx, item.contentYPx, item.contentWidthPx, item.contentHeightPx, -widthPx / 2, -heightPx / 2, widthPx, heightPx)
  ctx.restore()
}

/** Rasterize bounded strips on the SAME global pixel grid as the full sheet. */
export async function renderPageToBlob(
  page: PackedPage,
  canvasWidthCm: number,
  maxHeightCm: number,
  onProgress?: (done: number, total: number) => void
): Promise<Blob> {
  const plan = planUsefulExport(page, canvasWidthCm, maxHeightCm)
  const sourceEntries = [...new Set(page.items.map((item) => item.previewUrl))]
  const images = new Map(await Promise.all(sourceEntries.map(async (url) => [url, await loadImage(url)] as const)))
  const canvas = document.createElement('canvas')
  // Limit working RGBA memory independently of the roll's length.
  const stripRows = Math.max(1, Math.min(256, Math.floor(2_000_000 / plan.widthPx)))
  canvas.width = plan.widthPx
  canvas.height = stripRows
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  async function* strips() {
    for (let top = 0; top < plan.heightPx; top += stripRows) {
      const rows = Math.min(stripRows, plan.heightPx - top)
      ctx!.clearRect(0, 0, plan.widthPx, stripRows)
      ctx!.save()
      ctx!.translate(-plan.offsetXPx, -plan.offsetYPx - top)
      for (const item of page.items) {
        const box = rotatedAabbCm(item.widthCm, item.heightCm, item.angle)
        if ((item.yCm + box.hCm) * plan.pxPerCm < plan.offsetYPx + top - 2 || item.yCm * plan.pxPerCm > plan.offsetYPx + top + rows + 2) continue
        const image = images.get(item.previewUrl)
        if (!image) throw new Error('Não foi possível preparar uma arte para a exportação.')
        drawItem(ctx!, item, image, plan.pxPerCm)
      }
      ctx!.restore()
      yield { rgba: ctx!.getImageData(0, 0, plan.widthPx, rows).data, rows }
      onProgress?.(top + rows, plan.heightPx)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
  try {
    return await encodeRgbaPng(plan.widthPx, plan.heightPx, plan.dpi, strips())
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

/** PNG of the useful composition at native density, at least 300 DPI. */
export async function downloadGangSheets(
  pages: PackedPage[],
  canvasWidthCm: number,
  maxHeightCm: number,
  itemGapCm: number,
  onProgress?: (done: number, total: number) => void
) {
  const nonEmptyPages = pages.filter((page) => page.items.length > 0)
  if (nonEmptyPages.length === 0) return []
  const issues = validateLayout(nonEmptyPages, canvasWidthCm, maxHeightCm, itemGapCm)
  const outside = issues.find((issue) => issue.type === 'outside-sheet')
  if (outside) throw new Error(`${outside.message} Mova a arte para dentro da folha para evitar cortes no arquivo.`)
  // Cutting-space/box intersections are advisory. The user's manual layout
  // remains authoritative: never force a repack or silently move artwork.
  const plans = nonEmptyPages.map((page) => planUsefulExport(page, canvasWidthCm, maxHeightCm))
  const filename = (index: number) => {
    const plan = plans[index]
    const width = (plan.widthPx / plan.pxPerCm).toFixed(2)
    const height = (plan.heightPx / plan.pxPerCm).toFixed(2)
    return `gang-sheet-dtf-pagina-${nonEmptyPages[index].index + 1}-${width}x${height}cm-${plan.dpi}dpi.png`
  }

  if (nonEmptyPages.length === 1) {
    const page = nonEmptyPages[0]
    triggerDownload(await renderPageToBlob(page, canvasWidthCm, maxHeightCm, onProgress), filename(0))
    return issues
  }

  const zip = new JSZip()
  const totalRows = plans.reduce((sum, plan) => sum + plan.heightPx, 0)
  let completedRows = 0
  for (const [index, page] of nonEmptyPages.entries()) {
    const blob = await renderPageToBlob(page, canvasWidthCm, maxHeightCm,
      (done) => onProgress?.(completedRows + done, totalRows))
    zip.file(filename(index), await blob.arrayBuffer())
    completedRows += plans[index].heightPx
  }
  triggerDownload(await zip.generateAsync({ type: 'blob' }), 'gang-sheets-dtf-png.zip')
  return issues
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
