import type { PlacedItem } from '@/types'

export interface ContentBounds {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Axis-aligned bounding box (in cm) of a placed art's VISIBLE content, correct
 * for any 0/90/180/270 rotation. This is the exact inverse of the mapping used
 * by the shape packer (`toPlacedItem`) and matches the fabric render formula in
 * CanvasPage/exportCanvas, so used-length and cost stay accurate after edits.
 */
export function contentBounds(item: PlacedItem): ContentBounds {
  const sc = item.contentWidthPx > 0 ? item.widthCm / item.contentWidthPx : 0
  const cx = item.contentXPx
  const cy = item.contentYPx
  const cw = item.contentWidthPx
  const ch = item.contentHeightPx
  const angle = ((item.angle % 360) + 360) % 360
  const rot90 = angle === 90 || angle === 270

  let left: number
  let top: number
  switch (angle) {
    case 90:
      left = item.xCm - (cx + cy + ch) * sc
      top = item.yCm - (cy - cx) * sc
      break
    case 180:
      left = item.xCm - (2 * cx + cw) * sc
      top = item.yCm - (2 * cy + ch) * sc
      break
    case 270:
      left = item.xCm - (cx - cy) * sc
      top = item.yCm - (cx + cw + cy) * sc
      break
    default:
      left = item.xCm
      top = item.yCm
  }

  return {
    left,
    top,
    width: rot90 ? item.heightCm : item.widthCm,
    height: rot90 ? item.widthCm : item.heightCm,
  }
}

/** Bottom-most visible content edge across items = real used length (cm). */
export function usedLengthCm(items: PlacedItem[]): number {
  let max = 0
  for (const it of items) {
    const b = contentBounds(it)
    if (b.top + b.height > max) max = b.top + b.height
  }
  return max
}
