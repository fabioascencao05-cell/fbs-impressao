import type { PackedPage, PlacedItem } from '@/types'
import { EXPORT_END_MARGIN_CM, EXPORT_PX_PER_CM, PRINT_DPI } from './constants'
import { rotatedAabbCm } from './geometry'

/** Same physical height for preview, statistics and PNG. Cropping is opt-in. */
export function sheetHeightCm(page: PackedPage, configuredHeightCm: number, trimHeight = false): number {
  if (!trimHeight) return configuredHeightCm
  const bottom = page.items.reduce((max, item) => Math.max(max,
    item.yCm + rotatedAabbCm(item.widthCm, item.heightCm, item.angle).hCm), 0)
  return Math.min(configuredHeightCm, Math.max(0.1, bottom + EXPORT_END_MARGIN_CM))
}

/** Fixed print density. Large sheets are rendered in strips, never split. */
export function planExport(page: PackedPage, widthCm: number, heightCm: number) {
  if (![widthCm, heightCm].every((n) => Number.isFinite(n) && n > 0)) throw new Error('Medidas de folha inválidas.')
  const pxPerCm = EXPORT_PX_PER_CM
  for (const item of page.items) {
    if (![item.widthCm, item.heightCm, item.contentWidthPx, item.contentHeightPx].every((n) => Number.isFinite(n) && n > 0)
      || ![item.xCm, item.yCm, item.angle].every(Number.isFinite)) throw new Error('Uma arte contém medidas inválidas. Gere a montagem novamente.')
    const sx = item.widthCm / item.contentWidthPx
    const sy = item.heightCm / item.contentHeightPx
    if (Math.abs(sx - sy) > Math.max(sx, sy) * 0.000001) throw new Error('Uma arte está fora da proporção original. Gere a montagem novamente antes de baixar.')
  }
  const widthPx = Math.ceil(widthCm * pxPerCm)
  const heightPx = Math.ceil(heightCm * pxPerCm)
  if (widthPx > 32767 || heightPx > 0x7fffffff || widthPx * heightPx > 1_000_000_000) {
    throw new Error('A metragem desta folha excede o limite de exportação. Reduza a metragem configurada. O sistema não divide artes nem reduz os 300 DPI automaticamente.')
  }
  return { pxPerCm, dpi: PRINT_DPI, widthPx, heightPx }
}

/** Only editable geometry may change, and both axes always share one scale. */
export function proportionatePatch(item: PlacedItem, patch: Partial<PlacedItem>): PlacedItem {
  const widthCm = patch.widthCm ?? (patch.heightCm === undefined ? item.widthCm : patch.heightCm * item.contentWidthPx / item.contentHeightPx)
  const next = { ...item, widthCm, heightCm: widthCm * item.contentHeightPx / item.contentWidthPx,
    xCm: patch.xCm ?? item.xCm, yCm: patch.yCm ?? item.yCm, angle: patch.angle ?? item.angle }
  return [next.widthCm, next.heightCm].every((n) => Number.isFinite(n) && n > 0)
    && [next.xCm, next.yCm, next.angle].every(Number.isFinite) ? next : item
}
