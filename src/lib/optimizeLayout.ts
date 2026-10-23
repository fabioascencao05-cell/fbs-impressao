import type { GangImage, PackedPage } from '@/types'
import { packImages, type PackingResult } from './binPacking'
import { packImagesByShape } from './shapePacking'
import { compactBlankBands } from './compactBands'
import { packingScore } from './packingScore'
import { validateLayout } from './layoutValidation'
import { packingHeightLimitCm } from './sheetDimensions'
import { EXPORT_END_MARGIN_CM } from './constants'

function improves(candidate: PackingResult, baseline: PackingResult): boolean {
  const a = packingScore(candidate), b = packingScore(baseline)
  for (let index = 0; index < a.length; index++) {
    if (Math.abs(a[index] - b[index]) > 1e-6) return a[index] < b[index]
  }
  return false
}

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
  const limit = packingHeightLimitCm(height)
  let reported = 0
  const progress = (stage: number) => (done: number, total: number) => {
    reported = Math.max(reported, Math.min(2000, stage * 1000 + Math.floor(done / Math.max(1, total) * 1000)))
    onProgress?.(reported, 2000)
  }
  const baseline = packImages(images, height, width, gap)
  const shaped = packImagesByShape(images, baseline, width, height, gap, progress(0))
  let result = validateLayout(shaped.pages, width, height, gap).length ? baseline : shaped
  result = keepEconomicalLayout(images, currentPages, result, width, limit, gap)
  // A complete single sheet already shorter than the requested length cannot
  // benefit from extending it. Otherwise compare both complete layouts by
  // total consumed film, never extend just to reduce the number of files.
  if (result.unplaced.length || result.pages.length > 1 || result.pages.some(page => page.usedHeightCm > height + 1e-6)) {
    const extended = packImages(images, limit, width, gap)
    const seed = improves(extended, result) ? extended : result
    const candidate = packImagesByShape(images, seed, width, limit, gap, progress(1))
    if (improves(candidate, result) && !validateLayout(candidate.pages, width, limit, gap).length) result = candidate
  }
  onProgress?.(2000, 2000)
  return { ...result, pages: result.pages.map(page => ({ ...page,
    autoExtended: page.usedHeightCm + EXPORT_END_MARGIN_CM > height + 1e-6 })) }
}

