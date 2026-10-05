import { rotatedAabbCm } from './geometry'
import { CELL_CM, clearanceOffsets, forEachSheetCell, shapeFor } from './shapeMask'
import type { GangImage, PackedPage, PlacedItem } from '@/types'

const EPSILON = 0.0001

export interface LayoutIssue {
  type: 'outside-sheet' | 'overlap' | 'insufficient-gap' | 'invalid-transform' | 'missing-copy'
  pageIndex: number
  itemIds: string[]
  message: string
}

function itemBounds(item: PlacedItem) {
  const box = rotatedAabbCm(item.widthCm, item.heightCm, item.angle)
  return { left: item.xCm, top: item.yCm, right: item.xCm + box.wCm, bottom: item.yCm + box.hCm }
}

function boundsDistance(a: ReturnType<typeof itemBounds>, b: ReturnType<typeof itemBounds>) {
  return Math.hypot(Math.max(0, a.left - b.right, b.left - a.right), Math.max(0, a.top - b.bottom, b.top - a.bottom))
}

function safelySeparated(a: ReturnType<typeof itemBounds>, b: ReturnType<typeof itemBounds>, gapCm: number) {
  if (gapCm > 0) return boundsDistance(a, b) >= gapCm - EPSILON
  return a.right <= b.left + EPSILON || b.right <= a.left + EPSILON || a.bottom <= b.top + EPSILON || b.bottom <= a.top + EPSILON
}

/** Independent final check for auto packing and manual editing. Conservative
 * sheet cells include every non-zero alpha source cell. White is ink; enclosed
 * transparent counters are already filled in the source mask. */
export function validateLayout(
  pages: PackedPage[],
  canvasWidthCm: number,
  maxHeightCm: number,
  itemGapCm = 0,
  expectedImages?: GangImage[]
): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  if (![canvasWidthCm, maxHeightCm, itemGapCm].every(Number.isFinite) || canvasWidthCm <= 0 || maxHeightCm <= 0 || itemGapCm < 0) {
    return [{ type: 'outside-sheet', pageIndex: 0, itemIds: [], message: 'Medidas da folha ou espaçamento inválidos.' }]
  }
  const neighbors = clearanceOffsets(itemGapCm)
  for (const page of pages) {
    for (const item of page.items) {
      const normalizedAngle = ((item.angle % 360) + 360) % 360
      const orthogonal = [0, 90, 180, 270].some((angle) => Math.abs(angle - normalizedAngle) < 0.0001)
      if (![item.xCm, item.yCm, item.widthCm, item.heightCm, item.angle].every(Number.isFinite) ||
          item.widthCm <= 0 || item.heightCm <= 0 || !orthogonal ||
          (item.rotationLocked && Math.abs(normalizedAngle) > 0.0001)) {
        issues.push({
          type: 'invalid-transform',
          pageIndex: page.index,
          itemIds: [item.id],
          message: `Uma arte da página ${page.index + 1} tem medida, posição ou rotação inválida.`,
        })
      }
    }
    if (page.items.every((item) => !item.occupancyMask)) {
      for (const [index, item] of page.items.entries()) {
        const a = itemBounds(item)
        if (![a.left, a.top, a.right, a.bottom].every(Number.isFinite) ||
          a.left < -EPSILON || a.top < -EPSILON || a.right > canvasWidthCm + EPSILON || a.bottom > maxHeightCm + EPSILON) {
          issues.push({ type: 'outside-sheet', pageIndex: page.index, itemIds: [item.id], message: `Uma arte da página ${page.index + 1} está fora da área imprimível.` })
        }
        for (const other of page.items.slice(0, index)) {
          const b = itemBounds(other)
          const overlap = a.left < b.right - EPSILON && b.left < a.right - EPSILON && a.top < b.bottom - EPSILON && b.top < a.bottom - EPSILON
          if (overlap || (itemGapCm > 0 && boundsDistance(a, b) < itemGapCm - EPSILON)) {
            issues.push({ type: overlap ? 'overlap' : 'insufficient-gap', pageIndex: page.index,
              itemIds: [other.id, item.id], message: overlap ? `Duas artes se sobrepõem na página ${page.index + 1}.` : `Duas artes da página ${page.index + 1} estão com menos de ${itemGapCm.toFixed(1)} cm de espaço.` })
          }
        }
      }
      continue
    }
    const cols = Math.ceil(canvasWidthCm / CELL_CM), rows = Math.ceil(maxHeightCm / CELL_CM)
    const owner = new Int32Array(cols * rows)
    const blocked = new Int32Array(cols * rows)
    for (const [index, item] of page.items.entries()) {
      const bounds = itemBounds(item)
      if (![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite) ||
        bounds.left < -EPSILON || bounds.top < -EPSILON || bounds.right > canvasWidthCm + EPSILON || bounds.bottom > maxHeightCm + EPSILON) {
        issues.push({ type: 'outside-sheet', pageIndex: page.index, itemIds: [item.id], message: `Uma arte da página ${page.index + 1} está fora da área imprimível.` })
        continue
      }
      const shape = shapeFor(item.occupancyMask, item.widthCm, item.heightCm, item.angle)
      let conflict = 0
      forEachSheetCell(item, shape, (x, y) => {
        if (x < 0 || y < 0 || x >= cols || y >= rows) return
        const at = y * cols + x
        if (owner[at]) {
          const other = page.items[owner[at] - 1]
          if (safelySeparated(bounds, itemBounds(other), itemGapCm)) return
          conflict = owner[at]; return true
        }
        if (blocked[at]) {
          const other = page.items[blocked[at] - 1]
          if (safelySeparated(bounds, itemBounds(other), itemGapCm)) return
          conflict = -blocked[at]; return true
        }
      })
      if (conflict) {
        const overlap = conflict > 0
        const other = page.items[Math.abs(conflict) - 1]
        issues.push({ type: overlap ? 'overlap' : 'insufficient-gap', pageIndex: page.index,
          itemIds: [other.id, item.id], message: overlap ? `Duas artes se sobrepõem na página ${page.index + 1}.` : `Duas artes da página ${page.index + 1} estão com menos de ${itemGapCm.toFixed(1)} cm de espaço.` })
        continue
      }
      forEachSheetCell(item, shape, (x, y) => {
        if (x < 0 || y < 0 || x >= cols || y >= rows) return
        const at = y * cols + x
        owner[at] = index + 1
        for (const [dx, dy] of neighbors) {
          const gx = x + dx, gy = y + dy
          if (gx >= 0 && gy >= 0 && gx < cols && gy < rows) blocked[gy * cols + gx] = index + 1
        }
      })
    }
  }
  if (expectedImages) {
    const counts = new Map<string, number>()
    for (const page of pages) for (const item of page.items)
      counts.set(item.sourceImageId, (counts.get(item.sourceImageId) ?? 0) + 1)
    for (const image of expectedImages) {
      const actual = counts.get(image.id) ?? 0
      if (actual < image.quantity) {
        issues.push({
          type: 'missing-copy',
          pageIndex: 0,
          itemIds: [],
          message: `Faltam ${image.quantity - actual} cópia(s) de "${image.file.name}" na montagem.`,
        })
      }
    }
  }
  return issues
}
