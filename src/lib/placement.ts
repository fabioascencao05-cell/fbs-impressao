import type { PlacedItem } from '@/types'

export interface FabricPlacement {
  left: number
  top: number
  scale: number
  angle: number
}

/**
 * Computes how to place a packed item on a Fabric canvas so its content box
 * lands exactly on the item's footprint rect — correct whether the art is
 * upright or turned 90°.
 *
 * Callers must use `originX: 'center', originY: 'center'`. Anchoring on the
 * image centre makes rotation trivial: a 90° turn just swaps the footprint's
 * width/height around the same centre, so no fragile corner-offset math is
 * needed. The returned `left/top` is the image centre in canvas pixels,
 * pre-compensated for any transparent padding around the content box.
 */
export function fabricPlacement(item: PlacedItem, pxPerCm: number): FabricPlacement {
  const rotated = Math.round(item.angle ?? 0) % 180 !== 0

  // Footprint width maps to the content's width when upright, to its height
  // when turned — that ratio fixes the scale (aspect ratio is locked).
  const contentWidthCm = rotated ? item.heightCm : item.widthCm
  const scale = (contentWidthCm * pxPerCm) / item.contentWidthPx

  // Target: the content box centre sits at the footprint centre on the sheet.
  const centerX = (item.xCm + item.widthCm / 2) * pxPerCm
  const centerY = (item.yCm + item.heightCm / 2) * pxPerCm

  // Offset from the content-box centre to the whole-image centre (0 when the
  // art has no transparent padding). Rotates with the object at 90°.
  const vx = (item.naturalWidthPx / 2 - (item.contentXPx + item.contentWidthPx / 2)) * scale
  const vy = (item.naturalHeightPx / 2 - (item.contentYPx + item.contentHeightPx / 2)) * scale

  return {
    left: rotated ? centerX - vy : centerX + vx,
    top: rotated ? centerY + vx : centerY + vy,
    scale,
    angle: rotated ? 90 : 0,
  }
}
