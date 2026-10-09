import type { OccupancyMask } from '@/types'

const ratios = new WeakMap<OccupancyMask, number>()

/** Area estimate of the reserved contour; enclosed logo counters stay reserved. */
export function occupiedAreaCm2(item: { widthCm: number; heightCm: number; occupancyMask?: OccupancyMask }): number {
  const mask = item.occupancyMask
  if (!mask) return item.widthCm * item.heightCm
  let ratio = ratios.get(mask)
  if (ratio === undefined) {
    ratio = mask.data.reduce((sum, cell) => sum + (cell ? 1 : 0), 0) / (mask.cols * mask.rows)
    ratios.set(mask, ratio)
  }
  return item.widthCm * item.heightCm * ratio
}
