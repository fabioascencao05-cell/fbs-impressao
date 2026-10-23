import type { PackedPage } from '@/types'
import { EXPORT_END_MARGIN_CM } from './constants'
import { rotatedAabbCm } from './geometry'

export const MAX_AUTO_EXTENSION_CM = 15

/** The automatic allowance includes the final cutting margin. */
export function packingHeightLimitCm(requestedHeightCm: number): number {
  return requestedHeightCm + MAX_AUTO_EXTENSION_CM - EXPORT_END_MARGIN_CM
}

/** Match the preview and manual drop coordinates to the actual chosen sheet. */
export function pageWorkspaceHeightCm(page: PackedPage, requestedHeightCm: number): number {
  if (!page.autoExtended) return requestedHeightCm
  const bottom = page.items.reduce((max, item) => Math.max(max,
    item.yCm + rotatedAabbCm(item.widthCm, item.heightCm, item.angle).hCm), 0)
  return Math.max(requestedHeightCm, Math.ceil((bottom + EXPORT_END_MARGIN_CM - 1e-8) * 10) / 10)
}
