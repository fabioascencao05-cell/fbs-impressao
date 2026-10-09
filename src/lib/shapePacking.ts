import type { GangImage, PackedPage, PlacedItem } from '@/types'
import type { PackingResult } from './binPacking'
import { rotatedAabbCm } from './geometry'
import { CELL_CM, clearanceOffsets, shapeFor, type Shape } from './shapeMask'

interface GridPage {
  words: Uint32Array
  stride: number
  rows: number
  items: PlacedItem[]
  usedHeightCm: number
}
interface Fit { page: GridPage; x: number; y: number; angle: number; shape: Shape; bottom: number }
interface Budget { left: number }

function newPage(width: number, height: number): GridPage {
  const stride = Math.ceil(Math.ceil(width / CELL_CM) / 32)
  const rows = Math.ceil(height / CELL_CM)
  return { words: new Uint32Array(stride * rows), stride, rows, items: [], usedHeightCm: 0 }
}

// Compare 32 occupied cells at once, rather than one alpha pixel at a time.
function fits(page: GridPage, shape: Shape, x: number, y: number, budget: Budget): boolean {
  const wordX = x >>> 5, shift = x & 31
  for (let row = 0; row < shape.rows; row++) {
    const base = (y + row) * page.stride + wordX
    for (let w = 0; w < shape.stride; w++) {
      if (--budget.left < 0) return false
      const bits = shape.words[row * shape.stride + w]
      if (!bits) continue
      if (page.words[base + w] & (bits << shift)) return false
      if (shift && wordX + w + 1 < page.stride && page.words[base + w + 1] & (bits >>> (32 - shift))) return false
    }
  }
  return true
}

function stamp(page: GridPage, shape: Shape, x: number, y: number, neighbors: Array<[number, number]>) {
  for (const [dx, dy] of neighbors) {
    const startX = x + dx, wordX = Math.floor(startX / 32), shift = ((startX % 32) + 32) % 32
    for (let row = 0; row < shape.rows; row++) {
      const gy = y + row + dy
      if (gy < 0 || gy >= page.rows) continue
      for (let w = 0; w < shape.stride; w++) {
        const bits = shape.words[row * shape.stride + w], gx = wordX + w
        if (gx >= 0 && gx < page.stride) page.words[gy * page.stride + gx] |= bits << shift
        if (shift && gx + 1 >= 0 && gx + 1 < page.stride) page.words[gy * page.stride + gx + 1] |= bits >>> (32 - shift)
      }
    }
  }
}

function anglesFor(item: PlacedItem, width: number, height: number): number[] {
  const angles = [0, 90, 180, 270]
  for (let a = 15; a < 360; a += 15) if (a % 90) angles.push(a)
  // Critical orientations can fit even when no sampled angle fits a blank
  // sheet. Include dimension roots and their interior midpoints, not resizing.
  const radius = Math.hypot(item.widthCm, item.heightCm)
  const critical = [0, 90]
  for (const [limit, phase] of [
    [width, Math.atan2(item.heightCm, item.widthCm)],
    [height, Math.atan2(item.widthCm, item.heightCm)],
  ]) {
    if (limit > radius) continue
    const delta = Math.acos(limit / radius)
    for (const r of [phase - delta, phase + delta]) if (r >= 0 && r <= Math.PI / 2) critical.push(r * 180 / Math.PI)
  }
  critical.sort((a, b) => a - b)
  for (let i = 0; i < critical.length; i++) {
    const a = critical[i]
    const mid = i ? (a + critical[i - 1]) / 2 : a
    for (const n of [a, mid]) angles.push(n, 180 - n, 180 + n, 360 - n)
  }
  return [...new Set(angles.map(a => Math.round(((a % 360) + 360) % 360 * 1e6) / 1e6))]
}

function findFit(page: GridPage, item: PlacedItem, width: number, height: number, budget: Budget, angular: boolean): Fit | null {
  let best: Fit | null = null
  const testAngle = (angle: number, step: number) => {
    const box = rotatedAabbCm(item.widthCm, item.heightCm, angle)
    const maxX = Math.floor((width - box.wCm + 1e-8) / CELL_CM)
    const maxY = Math.floor((height - box.hCm + 1e-8) / CELL_CM)
    if (maxX < 0 || maxY < 0 || budget.left <= 0) return
    if (best && box.hCm > best.bottom + 1e-8) return
    const shape = shapeFor(item.occupancyMask, item.widthCm, item.heightCm, angle)
    let foundY = -1, foundX = -1
    const lastY = Math.min(maxY, best ? Math.floor((best.bottom - box.hCm + 1e-8) / CELL_CM) : maxY)
    // First place an empty page at the origin. On populated pages search the
    // whole width, including cavities, then refine to a one-millimetre grid.
    for (let y = 0; y <= lastY && foundY < 0 && budget.left > 0; y += step) {
      for (let x = 0; x <= maxX && budget.left > 0; x += step) {
        if (fits(page, shape, x, y, budget)) { foundY = y; foundX = x; break }
      }
    }
    if (foundY < 0) return
    if (step > 1) {
      let refined = false
      for (let y = Math.max(0, foundY - step + 1); y <= foundY && !refined && budget.left > 0; y++) {
        for (let x = 0; x <= maxX && budget.left > 0; x++) {
          if (fits(page, shape, x, y, budget)) { foundY = y; foundX = x; refined = true; break }
        }
      }
    }
    const bottom = foundY * CELL_CM + box.hCm
    if (!best || bottom < best.bottom - 1e-8 || (Math.abs(bottom - best.bottom) < 1e-8 && foundX < best.x))
      best = { page, x: foundX, y: foundY, angle, shape, bottom }
  }
  const angles = angular ? anglesFor(item, width, height) : [0, 90, 180, 270]
  for (const angle of angles) {
    testAngle(angle, page.items.length ? 3 : 1)
    const current = best as Fit | null
    // An orthogonal fit inside the already used length adds no film. Search
    // other angles when a piece would otherwise extend or open another sheet.
    if (current && angle === 270 && current.bottom <= page.usedHeightCm + 1e-8) return current
    if (current && !page.items.length && current.bottom <= Math.min(item.widthCm, item.heightCm) + 1e-8) return current
  }
  // Refine the winning angular region; manual rotation remains continuous.
  const coarse = best as Fit | null
  if (angular && coarse && page.items.length) for (let delta = -14; delta <= 14 && budget.left > 0; delta++) {
    if (delta) testAngle((coarse.angle + delta + 360) % 360, 3)
  }
  return best
}

function score(result: PackingResult): number[] {
  return [result.unplaced.length, result.pages.length, result.pages.reduce((sum, page) => sum + page.usedHeightCm, 0)]
}
function better(candidate: PackingResult, baseline: PackingResult): boolean {
  const a = score(candidate), b = score(baseline)
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-8) return a[i] < b[i]
  return false
}

/** Keep the rectangular solution unless a complete contour solution improves it.
 * All copies, including pieces rejected by the orthogonal packer, are searched.
 * Bounded work runs in a worker; cancellation never changes the current layout.
 */
export function packImagesByShape(images: GangImage[], baseline: PackingResult, width: number, height: number, gap: number,
  onProgress?: (done: number, total: number) => void): PackingResult {
  const source = new Map(images.map(image => [image.id, image]))
  const attach = (item: PlacedItem) => ({ ...item, occupancyMask: source.get(item.sourceImageId)?.occupancyMask })
  let winner: PackingResult = { ...baseline, pages: baseline.pages.map(page => ({ ...page, items: page.items.map(attach) })) }
  const units: PlacedItem[] = images.flatMap(image => Array.from({ length: image.quantity }, (_, copy) => ({
    id: `${image.id}-${copy}`, sourceImageId: image.id, previewUrl: image.previewUrl,
    xCm: 0, yCm: 0, widthCm: image.widthCm, heightCm: image.heightCm, angle: 0,
    occupancyMask: image.occupancyMask, contentXPx: image.contentXPx, contentYPx: image.contentYPx,
    contentWidthPx: image.contentWidthPx, contentHeightPx: image.contentHeightPx,
    naturalWidthPx: image.naturalWidthPx, naturalHeightPx: image.naturalHeightPx,
  })))
  if (!units.length || (!units.some(item => item.occupancyMask) && !baseline.unplaced.length && units.length > 120)) return winner
  // Very large jobs retain the established rectangular layout. Avoid allocating
  // an unbounded grid for invalid settings or making thousands of copies slow.
  if (units.length > 350 || Math.ceil(width / CELL_CM) * Math.ceil(height / CELL_CM) > 8_000_000 || gap > 5) return winner
  const byId = new Map(units.map(item => [item.id, item]))
  const baselineOrder = baseline.pages.flatMap(page => page.items.map(item => byId.get(item.id)!))
  const remaining = units.filter(item => !baselineOrder.some(placed => placed.id === item.id))
  const rawOrders = [
    [...units].sort((a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm || a.id.localeCompare(b.id)),
    [...baselineOrder, ...remaining],
    [...units].sort((a, b) => Math.max(b.widthCm, b.heightCm) - Math.max(a.widthCm, a.heightCm) || a.id.localeCompare(b.id)),
  ]
  const seenOrders = new Set<string>()
  const uniqueOrders = rawOrders.filter(order => {
    const key = order.map(item => item.id).join('/')
    if (seenOrders.has(key)) return false
    seenOrders.add(key)
    return true
  })
  // Finish a fast contour pass before the more expensive angular search, so a
  // bounded/interrupted fine search can retain a complete useful improvement.
  const trials = [false, true].flatMap(angular => uniqueOrders.map(order => ({ order, angular })))
  // Reserve a small interpolation fringe in addition to the requested gap.
  // Original alpha is sampled conservatively, while print raster antialiasing
  // can extend by up to a few original/output pixels after scaling/rotation.
  const fringe = Math.max(2.54 / 300, ...units.map(item => Math.max(
    item.widthCm / item.contentWidthPx, item.heightCm / item.contentHeightPx))) * 2
  const neighbors = clearanceOffsets(gap > 0 ? gap + 2 * fringe : 0)
  for (let variant = 0; variant < trials.length; variant++) {
    const { order, angular } = trials[variant]
    const pages: GridPage[] = [], unplaced: PackingResult['unplaced'] = []
    const budget = { left: Math.min(400_000_000, Math.max(8_000_000, units.length * 5_000_000)) }
    let complete = true
    for (const [index, item] of order.entries()) {
      let best: Fit | null = null
      for (const page of pages) {
        const fit = findFit(page, item, width, height, budget, angular)
        if (fit && (!best || Math.max(page.usedHeightCm, fit.bottom) - page.usedHeightCm < Math.max(best.page.usedHeightCm, best.bottom) - best.page.usedHeightCm - 1e-8)) best = fit
      }
      if (!best && budget.left > 0) {
        const fresh = newPage(width, height)
        best = findFit(fresh, item, width, height, budget, angular)
        if (best) pages.push(fresh)
      }
      if (budget.left <= 0) { complete = false; break }
      if (!best) unplaced.push({ sourceImageId: item.sourceImageId, widthCm: item.widthCm, heightCm: item.heightCm })
      else {
        best.page.items.push({ ...item, xCm: best.x * CELL_CM, yCm: best.y * CELL_CM, angle: best.angle })
        best.page.usedHeightCm = Math.max(best.page.usedHeightCm, best.bottom)
        stamp(best.page, best.shape, best.x, best.y, neighbors)
      }
      onProgress?.(variant * units.length + index + 1, trials.length * units.length)
    }
    if (!complete) continue
    const result = { pages: pages.map((page, index): PackedPage => ({ index, items: page.items, usedHeightCm: page.usedHeightCm })), unplaced, strategy: 'contornos/rotacao-livre' }
    if (better(result, winner)) winner = result
  }
  return winner
}
