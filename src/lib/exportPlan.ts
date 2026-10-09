import type { PackedPage, PlacedItem } from '@/types'
import { EXPORT_END_MARGIN_CM, PRINT_DPI } from './constants'
import { rotatedAabbCm } from './geometry'

/** Canvas height for editing, or absolute bottom plus the final print margin. */
export function sheetHeightCm(page: PackedPage, configuredHeightCm: number, trimHeight = false): number {
  if (!trimHeight) return configuredHeightCm
  const bottom = page.items.reduce((max, item) => Math.max(max,
    item.yCm + rotatedAabbCm(item.widthCm, item.heightCm, item.angle).hCm), 0)
  return Math.max(0.1, bottom + EXPORT_END_MARGIN_CM)
}

/** At least 300 DPI, never fewer output pixels than any positioned original. */
export function exportDpi(page: PackedPage): number {
  return Math.ceil(page.items.reduce((dpi, item) => Math.max(dpi,
    item.contentWidthPx / item.widthCm * 2.54,
    item.contentHeightPx / item.heightCm * 2.54), PRINT_DPI))
}

/** Crop the outer empty area on the same global pixel grid, preserving relative
 * positions, physical sizes, internal gaps and transparent contours. A pixel
 * fringe protects rotated edges; the existing final cutting margin remains.
 */
export function planUsefulExport(page: PackedPage, widthCm: number, maxHeightCm: number) {
  const heightCm = sheetHeightCm(page, maxHeightCm, true)
  const dpi = validateExportGeometry(page, widthCm, heightCm)
  const pxPerCm = dpi / 2.54
  const plan = { dpi, pxPerCm, widthPx: Math.ceil(widthCm * pxPerCm), heightPx: Math.ceil(heightCm * pxPerCm) }
  if (!page.items.length) return { ...plan, offsetXPx: 0, offsetYPx: 0 }
  let left = Infinity, top = Infinity, right = 0
  for (const item of page.items) {
    left = Math.min(left, item.xCm)
    top = Math.min(top, item.yCm)
    right = Math.max(right, item.xCm + rotatedAabbCm(item.widthCm, item.heightCm, item.angle).wCm)
  }
  const offsetXPx = Math.max(0, Math.floor(left * plan.pxPerCm) - 1)
  const offsetYPx = Math.max(0, Math.floor(top * plan.pxPerCm) - 1)
  const cropped = { ...plan, offsetXPx, offsetYPx,
    widthPx: Math.min(plan.widthPx, Math.ceil(right * plan.pxPerCm) + 1) - offsetXPx,
    heightPx: plan.heightPx - offsetYPx }
  assertExportSize(cropped.widthPx, cropped.heightPx)
  return cropped
}

function validateExportGeometry(page: PackedPage, widthCm: number, heightCm: number) {
  if (![widthCm, heightCm].every((n) => Number.isFinite(n) && n > 0)) throw new Error('Medidas de folha inválidas.')
  for (const item of page.items) {
    if (![item.widthCm, item.heightCm, item.contentWidthPx, item.contentHeightPx].every((n) => Number.isFinite(n) && n > 0)
      || ![item.xCm, item.yCm, item.angle].every(Number.isFinite)) throw new Error('Uma arte contém medidas inválidas. Gere a montagem novamente.')
    const sx = item.widthCm / item.contentWidthPx
    const sy = item.heightCm / item.contentHeightPx
    if (Math.abs(sx - sy) > Math.max(sx, sy) * 0.000001) throw new Error('Uma arte está fora da proporção original. Gere a montagem novamente antes de baixar.')
  }
  return exportDpi(page)
}

function assertExportSize(widthPx: number, heightPx: number) {
  if (![widthPx, heightPx].every(n => Number.isFinite(n) && n > 0)
    || widthPx > 32767 || heightPx > 0x7fffffff || widthPx * heightPx > 1_000_000_000) {
    throw new Error('A área útil e a resolução desta folha excedem o limite de exportação. Distribua as artes entre mais folhas. O sistema não divide artes nem reduz a resolução automaticamente.')
  }
}

/** Large sheets are rendered in strips, never split or downsampled. */
export function planExport(page: PackedPage, widthCm: number, heightCm: number) {
  const dpi = validateExportGeometry(page, widthCm, heightCm)
  const pxPerCm = dpi / 2.54
  const widthPx = Math.ceil(widthCm * pxPerCm)
  const heightPx = Math.ceil(heightCm * pxPerCm)
  assertExportSize(widthPx, heightPx)
  return { pxPerCm, dpi, widthPx, heightPx }
}

/** Only editable geometry may change, and both axes always share one scale. */
export function proportionatePatch(item: PlacedItem, patch: Partial<PlacedItem>): PlacedItem {
  const widthCm = patch.widthCm ?? (patch.heightCm === undefined ? item.widthCm : patch.heightCm * item.contentWidthPx / item.contentHeightPx)
  const next = { ...item, widthCm, heightCm: widthCm * item.contentHeightPx / item.contentWidthPx,
    xCm: patch.xCm ?? item.xCm, yCm: patch.yCm ?? item.yCm, angle: patch.angle ?? item.angle }
  return [next.widthCm, next.heightCm].every((n) => Number.isFinite(n) && n > 0)
    && [next.xCm, next.yCm, next.angle].every(Number.isFinite) ? next : item
}
