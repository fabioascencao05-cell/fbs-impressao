import type { GangImage, PackedPage, PlacedItem } from '@/types'
import { rotatedAabbCm } from './geometry'
import { CELL_CM, clearanceOffsets, shapeFor, type Shape } from './shapeMask'

interface GridPage {
  blocked: Uint8Array
  cols: number
  rows: number
  items: PlacedItem[]
  usedHeightCm: number
}

interface Fit { page: GridPage; x: number; y: number; angle: number; shape: Shape; height: number }

function newPage(widthCm: number, heightCm: number): GridPage {
  const cols = Math.ceil(widthCm / CELL_CM)
  const rows = Math.ceil(heightCm / CELL_CM)
  return { blocked: new Uint8Array(cols * rows), cols, rows, items: [], usedHeightCm: 0 }
}

function fits(page: GridPage, shape: Shape, x: number, y: number): boolean {
  for (let k = 0; k < shape.offsets.length; k += 2) {
    if (page.blocked[(y + shape.offsets[k + 1]) * page.cols + x + shape.offsets[k]]) return false
  }
  return true
}

function stamp(page: GridPage, shape: Shape, x: number, y: number, neighbors: Array<[number, number]>) {
  for (let k = 0; k < shape.offsets.length; k += 2) {
    const cx = x + shape.offsets[k], cy = y + shape.offsets[k + 1]
    for (const [dx, dy] of neighbors) {
      const gx = cx + dx, gy = cy + dy
      if (gx >= 0 && gy >= 0 && gx < page.cols && gy < page.rows) page.blocked[gy * page.cols + gx] = 1
    }
  }
}

/** Search real occupied pixels; every piece stays an indivisible image. */
function findFit(page: GridPage, item: PlacedItem, widthCm: number, maxHeightCm: number, budget: { left: number }): Fit | null {
  let best: Fit | null = null
  for (const angle of [0, 90, 180, 270]) {
    const box = rotatedAabbCm(item.widthCm, item.heightCm, angle)
    const maxX = Math.floor((widthCm - box.wCm + 1e-8) / CELL_CM)
    const maxY = Math.floor((maxHeightCm - box.hCm + 1e-8) / CELL_CM)
    if (maxX < 0 || maxY < 0) continue
    const shape = shapeFor(item.occupancyMask, item.widthCm, item.heightCm, angle)
    if (shape.cols > page.cols || shape.rows > page.rows) continue
    let found = false
    for (let y = 0; y <= maxY && !found; y++) {
      if (best && y * CELL_CM + box.hCm >= best.height - 1e-8) break
      for (let x = 0; x <= maxX; x++) {
        if (--budget.left < 0) return best
        if (!fits(page, shape, x, y)) continue
        const height = y * CELL_CM + box.hCm
        if (!best || height < best.height - 1e-8 || (Math.abs(height - best.height) < 1e-8 && x < best.x))
          best = { page, x, y, angle, shape, height }
        found = true
        break
      }
    }
  }
  return best
}

/** The established rectangular MaxRects result is the safety baseline. */
export function packImagesByShape(
  images: GangImage[],
  baseline: PackedPage[],
  widthCm: number,
  maxHeightCm: number,
  gapCm: number,
  onProgress?: (done: number, total: number) => void,
): PackedPage[] {
  const source = new Map(images.map((image) => [image.id, image]))
  const units = baseline.flatMap((page) => page.items).map((item) => ({
    ...item, occupancyMask: source.get(item.sourceImageId)?.occupancyMask,
  }))
  if (!units.length || !units.some((item) => item.occupancyMask)) return baseline
  const filmLength = (pages: PackedPage[]) => pages.reduce((sum, page) => sum + Math.min(maxHeightCm, Math.max(0.1, page.usedHeightCm + 0.1)), 0)
  const oldLength = filmLength(baseline)
  const orders = [
    [...units].sort((a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm || a.id.localeCompare(b.id)),
    units,
  ]
  let winner = baseline
  const neighbors = clearanceOffsets(gapCm)
  for (let variant = 0; variant < orders.length; variant++) {
    const pages: GridPage[] = []
    const budget = { left: Math.min(2_000_000, Math.max(80_000, units.length * 30_000)) }
    let complete = true
    for (const [index, item] of orders[variant].entries()) {
      let best: Fit | null = null
      for (const page of pages) {
        const fit = findFit(page, item, widthCm, maxHeightCm, budget)
        if (fit && (!best || Math.max(page.usedHeightCm, fit.height) - page.usedHeightCm < Math.max(best.page.usedHeightCm, best.height) - best.page.usedHeightCm - 1e-8)) best = fit
      }
      const fresh = newPage(widthCm, maxHeightCm)
      if (!best) {
        best = findFit(fresh, item, widthCm, maxHeightCm, budget)
        if (best) pages.push(fresh)
      }
      if (!best) { complete = false; break }
      const placed = { ...item, xCm: best.x * CELL_CM, yCm: best.y * CELL_CM, angle: best.angle }
      best.page.items.push(placed)
      best.page.usedHeightCm = Math.max(best.page.usedHeightCm, best.height)
      stamp(best.page, best.shape, best.x, best.y, neighbors)
      onProgress?.(variant * units.length + index + 1, orders.length * units.length)
    }
    if (!complete) continue
    const length = filmLength(pages.map((page, index) => ({ index, items: page.items, usedHeightCm: page.usedHeightCm })))
    if (length < oldLength - 1e-8 && length < filmLength(winner) - 1e-8) {
      winner = pages.map((page, index) => ({ index, items: page.items, usedHeightCm: page.usedHeightCm }))
    }
  }
  return winner
}
