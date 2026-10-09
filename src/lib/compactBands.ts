import type { PackingResult } from './binPacking'
import { rotatedAabbCm } from './geometry'

/** Remove full-width blank bands in one pass, without searching/reordering art.
 * A band is removed only between disjoint vertical bounding-box groups, so
 * every contour and rotation is preserved and the requested gap stays intact.
 */
export function compactBlankBands(result: PackingResult, gapCm: number): PackingResult {
  let changed = false
  const pages = result.pages.filter(page => page.items.length > 0).map(page => {
    if (page.items.some(item => item.yCm < 0)) return page
    const ordered = [...page.items].sort((a, b) => a.yCm - b.yCm)
    const shifts = new Map<string, number>()
    let bottom = 0, shift = ordered[0].yCm
    for (let index = 0; index < ordered.length; index++) {
      const item = ordered[index]
      if (index && item.yCm > bottom + gapCm) shift += item.yCm - bottom - gapCm
      shifts.set(item.id, shift)
      bottom = Math.max(bottom, item.yCm + rotatedAabbCm(item.widthCm, item.heightCm, item.angle).hCm)
    }
    if (![...shifts.values()].some(shift => shift > 1e-8)) return page
    changed = true
    const items = page.items.map(item => ({ ...item, yCm: item.yCm - shifts.get(item.id)! }))
    const usedHeightCm = items.reduce((max, item) => Math.max(max,
      item.yCm + rotatedAabbCm(item.widthCm, item.heightCm, item.angle).hCm), 0)
    return { ...page, items, usedHeightCm }
  })
  return changed ? { ...result, pages, strategy: `${result.strategy}/sem-faixas-vazias` } : result
}
