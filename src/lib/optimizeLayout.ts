import type { GangImage, PackedPage } from '@/types'
import { packImages, type PackingResult } from './binPacking'
import { packImagesByShape } from './shapePacking'
import { compactBlankBands } from './compactBands'
import { packingScore } from './packingScore'
import { validateLayout } from './layoutValidation'

/** Only a complete, valid incumbent with the same source sizes/counts can
 * compete. A cheap but overlapping/stale layout is never a valid fallback.
 */
export function keepEconomicalLayout(images: GangImage[], pages: PackedPage[], result: PackingResult,
  width: number, height: number, gap: number): PackingResult {
  if (!pages.length) return result
  const source = new Map(images.map(image => [image.id, image]))
  const counts = new Map<string, number>(), ids = new Set<string>()
  for (const page of pages) for (const item of page.items) {
    const image = source.get(item.sourceImageId)
    if (!image || ids.has(item.id) || Math.abs(image.widthCm - item.widthCm) > 1e-6
      || Math.abs(image.heightCm - item.heightCm) > 1e-6) return result
    ids.add(item.id)
    counts.set(image.id, (counts.get(image.id) ?? 0) + 1)
  }
  if (images.some(image => counts.get(image.id) !== image.quantity)) return result
  const incumbent = compactBlankBands({ pages, unplaced: [], strategy: 'montagem-atual/mais-economica' }, gap)
  const a = packingScore(incumbent), b = packingScore(result)
  for (let index = 0; index < a.length; index++) {
    if (a[index] > b[index] + 1e-6) return result
    if (a[index] < b[index] - 1e-6) break
  }
  return validateLayout(incumbent.pages, width, height, gap).length ? result : incumbent
}

export function optimizeLayout(images: GangImage[], height: number, width: number, gap: number,
  currentPages: PackedPage[] = [], onProgress?: (done: number, total: number) => void): PackingResult {
  const baseline = packImages(images, height, width, gap)
  const result = packImagesByShape(images, baseline, width, height, gap, onProgress)
  return keepEconomicalLayout(images, currentPages, result, width, height, gap)
}
