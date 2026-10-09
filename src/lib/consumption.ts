import type { GangImage, PackedPage, PlacedItem } from '@/types'
import { EXPORT_END_MARGIN_CM } from './constants'
import { rotatedAabbCm } from './geometry'
import { occupiedAreaCm2 } from './occupiedArea'

/** The PNG crops outer empty bands. Bill the same occupied vertical span,
 * with internal gaps and the trailing margin, once per nonempty page.
 * Canvas height, preview/export options and cached usedHeightCm are NOT inputs.
 */
export function consumedLengthCm(items: PlacedItem[], endMarginCm = EXPORT_END_MARGIN_CM): number {
  if (!items.length) return 0
  const top = Math.min(...items.map(item => item.yCm))
  const bottom = items.reduce((bottom, item) => Math.max(bottom,
    item.yCm + rotatedAabbCm(item.widthCm, item.heightCm, item.angle).hCm), top)
  return bottom - top + endMarginCm
}

export function requestedImageTotals(images: GangImage[]) {
  return images.reduce((total, image) => ({
    units: total.units + image.quantity,
    imageAreaCm2: total.imageAreaCm2 + image.widthCm * image.heightCm * image.quantity,
  }), { units: 0, imageAreaCm2: 0 })
}

/** Sum actual instances, never multiply placed items by the queue quantity again. */
export function calculateConsumption(pages: PackedPage[], rollWidthCm: number, costPerMeter: number) {
  let units = 0, imageAreaCm2 = 0, contourAreaCm2 = 0, lengthCm = 0
  for (const page of pages) {
    lengthCm += consumedLengthCm(page.items)
    for (const item of page.items) {
      units++
      imageAreaCm2 += item.widthCm * item.heightCm
      contourAreaCm2 += occupiedAreaCm2(item)
    }
  }
  const filmAreaCm2 = rollWidthCm * lengthCm
  // Irregular art can have interlocking bounding rectangles. Use the existing
  // contour estimate for waste/efficiency, but show width × height separately.
  const wasteAreaCm2 = Math.max(0, filmAreaCm2 - contourAreaCm2)
  const efficiency = filmAreaCm2 > 0 ? Math.min(100, contourAreaCm2 / filmAreaCm2 * 100) : 0
  const lengthMeters = lengthCm / 100
  return { units, imageAreaCm2, contourAreaCm2, lengthCm, lengthMeters, filmAreaCm2,
    wasteAreaCm2, efficiency, cost: lengthMeters * costPerMeter }
}
