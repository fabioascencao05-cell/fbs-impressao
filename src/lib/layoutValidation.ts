import { CELL_CM, clearanceOffsets, forEachSheetCell, shapeFor } from './shapeMask'
import { rotatedAabbCm } from './geometry'
import type { PackedPage, PlacedItem } from '@/types'

const EPSILON = 0.0001

export interface LayoutIssue {
  type: 'outside-sheet' | 'overlap' | 'insufficient-gap'
  pageIndex: number
  itemIds: string[]
  message: string
}

function itemBounds(item: PlacedItem) {
  const box = rotatedAabbCm(item.widthCm, item.heightCm, item.angle)
  return { left: item.xCm, top: item.yCm, right: item.xCm + box.wCm, bottom: item.yCm + box.hCm }
}

function overlaps(a: ReturnType<typeof itemBounds>, b: ReturnType<typeof itemBounds>): boolean {
  return a.left < b.right - EPSILON && a.right > b.left + EPSILON && a.top < b.bottom - EPSILON && a.bottom > b.top + EPSILON
}

function distanceBetween(a: ReturnType<typeof itemBounds>, b: ReturnType<typeof itemBounds>): number {
  const horizontal = Math.max(0, a.left - b.right, b.left - a.right)
  const vertical = Math.max(0, a.top - b.bottom, b.top - a.bottom)
  return Math.hypot(horizontal, vertical)
}

/**
 * Manual editing is useful, but exporting overlapping or off-sheet artwork
 * wastes a DTF print. Validate the final layout immediately before export.
 */
export function validateLayout(
  pages: PackedPage[],
  canvasWidthCm: number,
  maxHeightCm: number,
  itemGapCm = 0
): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  for (const page of pages) {
    const bounds = page.items.map((item) => ({ item, bounds: itemBounds(item) }))
    for (const { item, bounds: rect } of bounds) {
      if (rect.left < -EPSILON || rect.top < -EPSILON || rect.right > canvasWidthCm + EPSILON || rect.bottom > maxHeightCm + EPSILON) {
        issues.push({
          type: 'outside-sheet',
          pageIndex: page.index,
          itemIds: [item.id],
          message: `Uma arte da página ${page.index + 1} está fora da área imprimível.`,
        })
      }
    }
    for (let first = 0; first < bounds.length; first++) {
      for (let second = first + 1; second < bounds.length; second++) {
        const a = bounds[first], b = bounds[second]
        if (distanceBetween(a.bounds, b.bounds) >= Math.max(itemGapCm - EPSILON, EPSILON)) continue
        let overlap = overlaps(a.bounds, b.bounds)
        let close = !overlap && itemGapCm > 0 && distanceBetween(a.bounds, b.bounds) < itemGapCm - EPSILON
        const irregular = a.item.occupancyMask || b.item.occupancyMask || a.item.angle % 90 || b.item.angle % 90
        if (irregular) {
          // Bounding boxes may overlap legitimately. Compare occupied areas in
          // the same conservative physical grid used by the contour solver.
          const margin = Math.ceil(itemGapCm / CELL_CM) + 2
          const originX = Math.floor(Math.min(a.bounds.left, b.bounds.left) / CELL_CM) - margin
          const originY = Math.floor(Math.min(a.bounds.top, b.bounds.top) / CELL_CM) - margin
          const stride = Math.ceil((Math.max(a.bounds.right, b.bounds.right) / CELL_CM) - originX) + margin + 2
          const key = (x: number, y: number) => (y - originY) * stride + x - originX
          const cells = new Set<number>()
          forEachSheetCell(a.item, shapeFor(a.item.occupancyMask, a.item.widthCm, a.item.heightCm, a.item.angle),
            (x, y) => { cells.add(key(x, y)) })
          const shapeB = shapeFor(b.item.occupancyMask, b.item.widthCm, b.item.heightCm, b.item.angle)
          overlap = forEachSheetCell(b.item, shapeB, (x, y) => cells.has(key(x, y)))
          close = false
          if (!overlap && itemGapCm > 0) {
            const neighbors = clearanceOffsets(itemGapCm)
            close = forEachSheetCell(b.item, shapeB, (x, y) => {
              for (const [dx, dy] of neighbors) if (cells.has(key(x + dx, y + dy))) return true
            })
          }
        }
        if (overlap || close) issues.push({
          type: overlap ? 'overlap' : 'insufficient-gap',
          pageIndex: page.index,
          itemIds: [a.item.id, b.item.id],
          message: overlap ? `Duas artes se sobrepõem na página ${page.index + 1}.`
            : `Duas artes da página ${page.index + 1} estão com menos de ${itemGapCm.toFixed(1)} cm de espaço.`,
        })
      }
    }
  }
  return issues
}
