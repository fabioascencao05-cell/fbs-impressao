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
        if (overlaps(bounds[first].bounds, bounds[second].bounds)) {
          issues.push({
            type: 'overlap',
            pageIndex: page.index,
            itemIds: [bounds[first].item.id, bounds[second].item.id],
            message: `Duas artes se sobrepõem na página ${page.index + 1}.`,
          })
        } else if (itemGapCm > 0 && distanceBetween(bounds[first].bounds, bounds[second].bounds) < itemGapCm - EPSILON) {
          issues.push({
            type: 'insufficient-gap',
            pageIndex: page.index,
            itemIds: [bounds[first].item.id, bounds[second].item.id],
            message: `Duas artes da página ${page.index + 1} estão com menos de ${itemGapCm.toFixed(1)} cm de espaço.`,
          })
        }
      }
    }
  }
  return issues
}
