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
  reservedBottomRow: number
}
interface Fit { page: GridPage; x: number; y: number; angle: number; shape: Shape; bottom: number }
interface Budget { left: number }

function newPage(width: number, height: number): GridPage {
  const stride = Math.ceil(Math.ceil(width / CELL_CM) / 32)
  const rows = Math.ceil(height / CELL_CM)
  return { words: new Uint32Array(stride * rows), stride, rows, items: [], usedHeightCm: 0, reservedBottomRow: 0 }
}

const collisionOrder = new WeakMap<Shape, Uint32Array>()
function occupiedWords(shape: Shape): Uint32Array {
  const cached = collisionOrder.get(shape)
  if (cached) return cached
  const countBits = (word: number) => {
    word -= (word >>> 1) & 0x55555555
    word = (word & 0x33333333) + ((word >>> 2) & 0x33333333)
    return (((word + (word >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
  }
  const indexes: number[] = []
  for (let i = 0; i < shape.words.length; i++) if (shape.words[i]) indexes.push(i)
  // Dense parts reject collisions first. Empty words in transparent corners
  // must not exhaust the search budget before later pages can be revisited.
  indexes.sort((a, b) => countBits(shape.words[b]) - countBits(shape.words[a])
    || Math.abs(Math.floor(a / shape.stride) - shape.rows / 2) - Math.abs(Math.floor(b / shape.stride) - shape.rows / 2))
  const order = Uint32Array.from(indexes)
  collisionOrder.set(shape, order)
  return order
}

// Compare 32 occupied cells at once, rather than one alpha pixel at a time.
function fits(page: GridPage, shape: Shape, x: number, y: number, budget: Budget): boolean {
  if (--budget.left < 0) return false
  if (y >= page.reservedBottomRow) return true
  const wordX = x >>> 5, shift = x & 31
  for (const index of occupiedWords(shape)) {
    if (--budget.left < 0) return false
    const row = Math.floor(index / shape.stride), w = index % shape.stride
    const base = (y + row) * page.stride + wordX + w, bits = shape.words[index]
    if (page.words[base] & (bits << shift)) return false
    if (shift && wordX + w + 1 < page.stride && page.words[base + 1] & (bits >>> (32 - shift))) return false
  }
  return true
}

function stamp(page: GridPage, shape: Shape, x: number, y: number, neighbors: Array<[number, number]>) {
  for (const [dx, dy] of neighbors) {
    page.reservedBottomRow = Math.max(page.reservedBottomRow, Math.min(page.rows, y + shape.rows + dy))
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

function stampItem(page: GridPage, item: PlacedItem, neighbors: Array<[number, number]>) {
  const shape = shapeFor(item.occupancyMask, item.widthCm, item.heightCm, item.angle)
  const x = item.xCm / CELL_CM, y = item.yCm / CELL_CM
  // MaxRects positions can fall between grid cells. Reserve both translated
  // cells, exactly as independent layout validation does for manual positions.
  for (const gx of new Set([Math.floor(x + 1e-8), Math.ceil(x - 1e-8)]))
    for (const gy of new Set([Math.floor(y + 1e-8), Math.ceil(y - 1e-8)])) stamp(page, shape, gx, gy, neighbors)
}

function gridFrom(items: PlacedItem[], width: number, height: number, neighbors: Array<[number, number]>): GridPage {
  const page = newPage(width, height)
  page.items = items
  for (const item of items) {
    page.usedHeightCm = Math.max(page.usedHeightCm, item.yCm + rotatedAabbCm(item.widthCm, item.heightCm, item.angle).hCm)
    stampItem(page, item, neighbors)
  }
  return page
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

function findFit(page: GridPage, item: PlacedItem, width: number, height: number, budget: Budget, angular: boolean,
  preferredAngle?: number): Fit | null {
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
    for (let y = 0; foundY < 0 && budget.left > 0; y += step) {
      const scanY = Math.min(y, lastY)
      for (let x = 0; budget.left > 0; x += step) {
        const scanX = Math.min(x, maxX)
        if (fits(page, shape, scanX, scanY, budget)) { foundY = scanY; foundX = scanX; break }
        if (x >= maxX) break
      }
      if (y >= lastY) break
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
  if (preferredAngle !== undefined && !angles.includes(preferredAngle)) angles.unshift(preferredAngle)
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
  return [result.unplaced.length, result.pages.length, result.pages.reduce((sum, page) => sum + page.usedHeightCm, 0),
    // Equal-length transfers still matter: pulling a non-bottom piece forward
    // frees the last sheet so a following move can actually close that sheet.
    result.pages.reduce((sum, page, index) => sum + index * page.items.reduce((area, item) => area + item.widthCm * item.heightCm, 0), 0),
    result.pages.reduce((sum, page) => sum + page.items.reduce((bottoms, item) =>
      bottoms + item.yCm + rotatedAabbCm(item.widthCm, item.heightCm, item.angle).hCm, 0), 0)]
}
function better(candidate: PackingResult, baseline: PackingResult): boolean {
  const a = score(candidate), b = score(baseline)
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-8) return a[i] < b[i]
  return false
}

/** Reinsert individual pieces from the last sheets into earlier cavities.
 * Each accepted move is already a complete layout: running out of work leaves
 * those gains intact instead of discarding a partially completed full repack.
 */
function compactAcrossPages(initial: PackingResult, width: number, height: number,
  neighbors: Array<[number, number]>, onProgress?: (done: number) => void): PackingResult {
  let winner = initial
  const count = initial.pages.reduce((n, page) => n + page.items.length, 0)
  const budget: Budget = { left: Math.min(120_000_000, Math.max(12_000_000,
    count * 1_000_000)) }
  for (let pass = 0; pass < 2 && budget.left > 0; pass++) {
    let changed = false
    const order = winner.pages.flatMap((page, pageIndex) => page.items.map(item => ({ item, pageIndex })))
      .sort((a, b) => b.pageIndex - a.pageIndex
        || (b.item.yCm + rotatedAabbCm(b.item.widthCm, b.item.heightCm, b.item.angle).hCm)
          - (a.item.yCm + rotatedAabbCm(a.item.widthCm, a.item.heightCm, a.item.angle).hCm))
    for (const [index, { item }] of order.entries()) {
      if (budget.left <= 0) break
      const sourceIndex = winner.pages.findIndex(page => page.items.some(placed => placed.id === item.id))
      if (sourceIndex < 0) continue
      const source = winner.pages[sourceIndex]
      const rest = source.items.filter(placed => placed.id !== item.id)
      const sourceGrid = gridFrom(rest, width, height, neighbors)
      let best = winner
      for (let targetIndex = 0; targetIndex <= sourceIndex && budget.left > 0; targetIndex++) {
        const target = winner.pages[targetIndex]
        const grid = targetIndex === sourceIndex ? sourceGrid : gridFrom(target.items, width, height, neighbors)
        // Earlier sheets may grow when that closes a later sheet; otherwise
        // limit the search to moves that can reduce the total used length.
        const released = source.usedHeightCm - sourceGrid.usedHeightCm
        const maxHeight = targetIndex === sourceIndex ? source.usedHeightCm
          : rest.length ? Math.min(height, target.usedHeightCm + released) : height
        const allowance = Math.min(budget.left, 2_000_000)
        const local = { left: allowance }
        const fit = findFit(grid, item, width, maxHeight, local, true, item.angle)
        budget.left -= allowance - Math.max(0, local.left)
        if (!fit) continue
        const moved = { ...item, xCm: fit.x * CELL_CM, yCm: fit.y * CELL_CM, angle: fit.angle }
        const candidate: PackingResult = {
          ...winner,
          pages: winner.pages.map((page, index) => {
            if (index === targetIndex) return { ...page, items: [...grid.items, moved], usedHeightCm: Math.max(grid.usedHeightCm, fit.bottom) }
            if (index === sourceIndex) return { ...page, items: rest, usedHeightCm: sourceGrid.usedHeightCm }
            return page
          }).filter(page => page.items.length).map((page, index) => ({ ...page, index })),
          strategy: 'contornos/redistribuido',
        }
        if (better(candidate, best)) best = candidate
      }
      if (best !== winner) { winner = best; changed = true }
      onProgress?.(pass * count + index + 1)
    }
    if (!changed) break
  }
  return winner
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
  const total = (trials.length + 4) * units.length
  onProgress?.(0, total)
  winner = compactAcrossPages(winner, width, height, neighbors, done => onProgress?.(done, total))
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
      onProgress?.((variant + 2) * units.length + index + 1, total)
    }
    if (!complete) continue
    const result = { pages: pages.map((page, index): PackedPage => ({ index, items: page.items, usedHeightCm: page.usedHeightCm })), unplaced, strategy: 'contornos/rotacao-livre' }
    if (better(result, winner)) winner = result
  }
  winner = compactAcrossPages(winner, width, height, neighbors,
    done => onProgress?.((trials.length + 2) * units.length + done, total))
  onProgress?.(total, total)
  return winner
}
