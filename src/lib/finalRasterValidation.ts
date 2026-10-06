import { EXPORT_END_MARGIN_CM } from './constants'
import { planExport } from './exportPlan'
import { rotatedAabbCm } from './geometry'
import type { LayoutIssue } from './layoutValidation'
import type { PackedPage, PlacedItem } from '@/types'

export interface BinaryRaster {
  originX: number
  originY: number
  width: number
  height: number
  alpha: Uint8Array
  boundary: Int32Array
  minX: number
  minY: number
  maxX: number
  maxY: number
  empty: boolean
}

/** Final validation treats every alpha > 0 pixel as printed, regardless of RGB. */
export function alphaPlaneFromRgba(rgba: Uint8ClampedArray): Uint8Array {
  const alpha = new Uint8Array(Math.floor(rgba.length / 4))
  for (let i = 0, p = 0; i + 3 < rgba.length; i += 4, p++) alpha[p] = rgba[i + 3] > 0 ? 1 : 0
  return alpha
}

export function analyzeBinaryAlpha(
  alpha: Uint8Array,
  width: number,
  height: number,
  originX = 0,
  originY = 0
): BinaryRaster {
  if (width <= 0 || height <= 0 || alpha.length !== width * height) throw new Error('Máscara raster inválida.')
  let minX = width, minY = height, maxX = -1, maxY = -1
  const boundary: number[] = []
  const occupied = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && alpha[y * width + x] !== 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!occupied(x, y)) continue
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    let edge = false
    for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && !occupied(x + dx, y + dy)) { edge = true; break }
    }
    if (edge) boundary.push(originX + x, originY + y)
  }
  const empty = maxX < minX
  return {
    originX, originY, width, height, alpha,
    boundary: Int32Array.from(boundary),
    minX: empty ? 0 : originX + minX,
    minY: empty ? 0 : originY + minY,
    maxX: empty ? -1 : originX + maxX,
    maxY: empty ? -1 : originY + maxY,
    empty,
  }
}

/** Minimum Euclidean distance between the occupied unit pixel squares. */
export function pixelSquareDistancePx(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.max(0, Math.abs(ax - bx) - 1)
  const dy = Math.max(0, Math.abs(ay - by) - 1)
  return Math.hypot(dx, dy)
}

function boundsDistancePx(a: BinaryRaster, b: BinaryRaster): number {
  const dx = Math.max(0, a.minX - b.maxX - 1, b.minX - a.maxX - 1)
  const dy = Math.max(0, a.minY - b.maxY - 1, b.minY - a.maxY - 1)
  return Math.hypot(dx, dy)
}

function alphaAtGlobal(mask: BinaryRaster, x: number, y: number): boolean {
  const lx = x - mask.originX, ly = y - mask.originY
  return lx >= 0 && ly >= 0 && lx < mask.width && ly < mask.height && mask.alpha[ly * mask.width + lx] !== 0
}

/**
 * Compares two rasters at the exact export pixel grid. Returns null when valid.
 * Rectangles may overlap: only alpha pixels and their physical distance matter.
 */
export function validateRasterPair(
  a: BinaryRaster,
  b: BinaryRaster,
  requiredGapPx: number
): 'overlap' | 'insufficient-gap' | null {
  if (a.empty || b.empty) return null

  const left = Math.max(a.minX, b.minX)
  const top = Math.max(a.minY, b.minY)
  const right = Math.min(a.maxX, b.maxX)
  const bottom = Math.min(a.maxY, b.maxY)
  if (left <= right && top <= bottom) {
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      if (alphaAtGlobal(a, x, y) && alphaAtGlobal(b, x, y)) return 'overlap'
    }
  }

  if (requiredGapPx <= 0 || boundsDistancePx(a, b) >= requiredGapPx - 1e-7) return null

  const cell = Math.max(1, Math.ceil(requiredGapPx + 1))
  const hash = new Map<string, number[]>()
  const insert = (x: number, y: number) => {
    const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`
    const bucket = hash.get(key)
    if (bucket) bucket.push(x, y)
    else hash.set(key, [x, y])
  }
  for (let i = 0; i < a.boundary.length; i += 2) insert(a.boundary[i], a.boundary[i + 1])

  const reach = requiredGapPx + 1
  for (let i = 0; i < b.boundary.length; i += 2) {
    const x = b.boundary[i], y = b.boundary[i + 1]
    const minBx = Math.floor((x - reach) / cell), maxBx = Math.floor((x + reach) / cell)
    const minBy = Math.floor((y - reach) / cell), maxBy = Math.floor((y + reach) / cell)
    for (let by = minBy; by <= maxBy; by++) for (let bx = minBx; bx <= maxBx; bx++) {
      const bucket = hash.get(`${bx},${by}`)
      if (!bucket) continue
      for (let k = 0; k < bucket.length; k += 2)
        if (pixelSquareDistancePx(bucket[k], bucket[k + 1], x, y) < requiredGapPx - 1e-7)
          return 'insufficient-gap'
    }
  }
  return null
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível carregar uma arte para a validação final.'))
    image.src = url
  })
}

function rasterizeItem(
  item: PlacedItem,
  image: HTMLImageElement,
  pxPerCm: number,
  pageWidthPx: number,
  pageHeightPx: number
): BinaryRaster {
  const box = rotatedAabbCm(item.widthCm, item.heightCm, item.angle)
  const leftPx = item.xCm * pxPerCm
  const topPx = item.yCm * pxPerCm
  const rightPx = (item.xCm + box.wCm) * pxPerCm
  const bottomPx = (item.yCm + box.hCm) * pxPerCm
  const originX = Math.max(0, Math.floor(leftPx) - 1)
  const originY = Math.max(0, Math.floor(topPx) - 1)
  const endX = Math.min(pageWidthPx, Math.ceil(rightPx) + 1)
  const endY = Math.min(pageHeightPx, Math.ceil(bottomPx) + 1)
  const width = Math.max(1, endX - originX)
  const height = Math.max(1, endY - originY)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D indisponível para validação final.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const scale = (item.widthCm * pxPerCm) / item.contentWidthPx
  const widthPx = item.contentWidthPx * scale
  const heightPx = item.contentHeightPx * scale
  ctx.save()
  ctx.translate(
    (item.xCm + box.wCm / 2) * pxPerCm - originX,
    (item.yCm + box.hCm / 2) * pxPerCm - originY
  )
  ctx.rotate((item.angle * Math.PI) / 180)
  ctx.drawImage(
    image,
    item.contentXPx, item.contentYPx, item.contentWidthPx, item.contentHeightPx,
    -widthPx / 2, -heightPx / 2, widthPx, heightPx
  )
  ctx.restore()

  const rgba = ctx.getImageData(0, 0, width, height).data
  const alpha = alphaPlaneFromRgba(rgba)
  canvas.width = 0
  canvas.height = 0
  return analyzeBinaryAlpha(alpha, width, height, originX, originY)
}

function exportedHeightCm(page: PackedPage, maxHeightCm: number): number {
  return Math.min(maxHeightCm, Math.max(0.1, page.usedHeightCm + EXPORT_END_MARGIN_CM))
}

/**
 * Independent export-resolution validation. It rerasterizes originals using the
 * final px/cm chosen by planExport and compares alpha pixels, not packing masks.
 */
export async function validateFinalRasterLayout(
  pages: PackedPage[],
  canvasWidthCm: number,
  maxHeightCm: number,
  itemGapCm: number
): Promise<LayoutIssue[]> {
  const issues: LayoutIssue[] = []
  for (const page of pages) {
    if (page.items.length === 0) continue
    const plan = planExport(page, canvasWidthCm, exportedHeightCm(page, maxHeightCm))
    const urls = [...new Set(page.items.map((item) => item.previewUrl))]
    const images = new Map(await Promise.all(urls.map(async (url) => [url, await loadImage(url)] as const)))
    const rasters: BinaryRaster[] = []
    for (const item of page.items) {
      const image = images.get(item.previewUrl)
      if (!image) throw new Error('Não foi possível preparar uma arte para a validação final.')
      const raster = rasterizeItem(item, image, plan.pxPerCm, plan.widthPx, plan.heightPx)
      if (raster.empty) {
        issues.push({
          type: 'invalid-transform',
          pageIndex: page.index,
          itemIds: [item.id],
          message: `Uma arte da página ${page.index + 1} ficou sem pixels impressos na resolução final.`,
        })
      }
      rasters.push(raster)
    }

    const requiredGapPx = itemGapCm * plan.pxPerCm
    for (let i = 0; i < page.items.length; i++) for (let j = 0; j < i; j++) {
      const problem = validateRasterPair(rasters[j], rasters[i], requiredGapPx)
      if (!problem) continue
      const a = page.items[j], b = page.items[i]
      issues.push({
        type: problem,
        pageIndex: page.index,
        itemIds: [a.id, b.id],
        message: problem === 'overlap'
          ? `Duas artes se sobrepõem na rasterização final da página ${page.index + 1}.`
          : `Duas artes da página ${page.index + 1} ficam com menos de ${itemGapCm.toFixed(2)} cm na rasterização final.`,
      })
    }
  }
  return issues
}
