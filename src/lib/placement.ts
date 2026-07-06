import type { PlacedItem } from '@/types'

export interface ContentBox {
  contentXPx: number
  contentYPx: number
  contentWidthPx: number
  contentHeightPx: number
}

/**
 * The 4 corners of the content box, scaled then rotated around the object's
 * top-left origin (Fabric's rotation pivot when originX/Y are 'left'/'top'),
 * in px relative to that origin. The AABB of these corners is the visible
 * footprint the packer reserves — this is what keeps rotated items (angle 90
 * from auto-rotation, or any manual angle) aligned with their slot.
 */
export function contentCorners(
  box: ContentBox,
  scaleX: number,
  scaleY: number,
  angleDeg: number
): Array<[number, number]> {
  const t = (angleDeg * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const pts: Array<[number, number]> = [
    [box.contentXPx * scaleX, box.contentYPx * scaleY],
    [(box.contentXPx + box.contentWidthPx) * scaleX, box.contentYPx * scaleY],
    [box.contentXPx * scaleX, (box.contentYPx + box.contentHeightPx) * scaleY],
    [(box.contentXPx + box.contentWidthPx) * scaleX, (box.contentYPx + box.contentHeightPx) * scaleY],
  ]
  return pts.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos])
}

/**
 * Uniform scale + Fabric left/top so the item's rotated content box lands
 * exactly on its stored xCm/yCm/widthCm/heightCm rect (the AABB the packer
 * reserved). item.widthCm is the AABB width, so the scale divides by the
 * content box's rotated horizontal extent.
 */
export function fabricPlacement(item: PlacedItem, pxPerCm: number) {
  const angle = item.angle ?? 0
  const t = (angle * Math.PI) / 180
  const scale =
    (item.widthCm * pxPerCm) /
    (item.contentWidthPx * Math.abs(Math.cos(t)) + item.contentHeightPx * Math.abs(Math.sin(t)))
  const box: ContentBox = {
    contentXPx: item.contentXPx,
    contentYPx: item.contentYPx,
    contentWidthPx: item.contentWidthPx,
    contentHeightPx: item.contentHeightPx,
  }
  const corners = contentCorners(box, scale, scale, angle)
  const left = item.xCm * pxPerCm - Math.min(...corners.map((c) => c[0]))
  const top = item.yCm * pxPerCm - Math.min(...corners.map((c) => c[1]))
  return { left, top, scale, angle, box }
}
