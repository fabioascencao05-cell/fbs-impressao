import JSZip from 'jszip'
import { EXPORT_END_MARGIN_CM } from './constants'
import { planExport } from './exportPlan'
import { rotatedAabbCm } from './geometry'
import { validateLayout } from './layoutValidation'
import type { PackedPage, PlacedItem } from '@/types'

function exportedHeightCm(page: PackedPage, maxHeightCm: number): number {
  return Math.min(maxHeightCm, Math.max(0.1, page.usedHeightCm + EXPORT_END_MARGIN_CM))
}

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

/** Replaces any browser density metadata with the actual export density. */
function setPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    if (bytes.length < 33 || String.fromCharCode(...bytes.slice(1, 4)) !== 'PNG') return blob

    const pixelsPerMeter = Math.round(dpi / 0.0254)
    const chunk = new Uint8Array(21)
    const view = new DataView(chunk.buffer)
    view.setUint32(0, 9)
    chunk.set([0x70, 0x48, 0x59, 0x73], 4) // pHYs
    view.setUint32(8, pixelsPerMeter)
    view.setUint32(12, pixelsPerMeter)
    chunk[16] = 1 // unit: metre
    view.setUint32(17, crc32(chunk.subarray(4, 17)))

    const parts: BlobPart[] = [bytes.slice(0, 33), chunk]
    for (let offset = 33; offset < bytes.length;) {
      const length = new DataView(bytes.buffer).getUint32(offset) + 12
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8))
      if (type !== 'pHYs') parts.push(bytes.slice(offset, offset + length))
      offset += length
    }
    return new Blob(parts, { type: 'image/png' })
  })
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function canvasToPng(canvas: HTMLCanvasElement, dpi: number): Promise<Blob> {
  const raw = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar PNG do canvas.'))), 'image/png')
  })
  return setPngDpi(raw, dpi)
}

async function renderPageToBlob(page: PackedPage, canvasWidthCm: number, maxHeightCm: number): Promise<Blob> {
  const plan = planExport(page, canvasWidthCm, exportedHeightCm(page, maxHeightCm))
  const canvas = document.createElement('canvas')
  canvas.width = plan.widthPx
  canvas.height = plan.heightPx
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Decode each original only once, even when the same art appears dezenas de
  // vezes na folha. Native Canvas retains the source pixels until the deliberate
  // print-scale conversion and is lighter than Fabric for large queues.
  const sourceEntries = [...new Set(page.items.map((item) => item.previewUrl))]
  const images = new Map(await Promise.all(sourceEntries.map(async (url) => [url, await loadImage(url)] as const)))
  for (const item of page.items) {
    const image = images.get(item.previewUrl)
    if (!image) throw new Error('Não foi possível preparar uma arte para a exportação.')
    drawItem(ctx, item, image, plan.pxPerCm)
  }
  try {
    return await canvasToPng(canvas, plan.dpi)
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

/** Exports at least 300 DPI, increasing density to retain every source's resolution. */
export async function downloadGangSheets(
  pages: PackedPage[],
  canvasWidthCm: number,
  maxHeightCm: number,
  itemGapCm: number
) {
  const nonEmptyPages = pages.filter((page) => page.items.length > 0)
  if (nonEmptyPages.length === 0) return
  const issues = validateLayout(nonEmptyPages, canvasWidthCm, maxHeightCm, itemGapCm)
  if (issues.length > 0) throw new Error(`${issues[0].message} Ajuste a arte ou clique em Re-empacotar antes de baixar.`)
  nonEmptyPages.forEach((page) => planExport(page, canvasWidthCm, exportedHeightCm(page, maxHeightCm)))

  if (nonEmptyPages.length === 1) {
    const page = nonEmptyPages[0]
    triggerDownload(await renderPageToBlob(page, canvasWidthCm, maxHeightCm), `gang-sheet-dtf-${exportedHeightCm(page, maxHeightCm).toFixed(1)}cm.png`)
    return
  }

  const zip = new JSZip()
  for (const page of nonEmptyPages) {
    const height = exportedHeightCm(page, maxHeightCm).toFixed(1)
    zip.file(`gang-sheet-dtf-pagina-${page.index + 1}-${height}cm.png`, await renderPageToBlob(page, canvasWidthCm, maxHeightCm))
  }
  triggerDownload(await zip.generateAsync({ type: 'blob' }), 'gang-sheets-dtf.zip')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
