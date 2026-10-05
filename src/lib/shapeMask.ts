import type { OccupancyMask, PlacedItem } from '@/types'
import type { ContentBox } from './trimImage'
import { rotatedAabbCm } from './geometry'

// One millimetre is the packing/validation unit. A source pixel marks its whole
// destination cell; downsampling may add clearance, never erase printed ink.
export const CELL_CM = 0.1
const SOURCE_MAX_CELLS = 512

export async function readOccupancyMask(file: File, box: ContentBox): Promise<OccupancyMask | null> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(1, SOURCE_MAX_CELLS / Math.max(box.widthPx, box.heightPx))
    const cols = Math.max(1, Math.ceil(box.widthPx * scale))
    const rows = Math.max(1, Math.ceil(box.heightPx * scale))
    const data = new Uint8Array(cols * rows)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1024
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    let occupied = 0
    for (let top = 0; top < box.heightPx; top += 1024) {
      for (let left = 0; left < box.widthPx; left += 1024) {
        const w = Math.min(1024, box.widthPx - left)
        const h = Math.min(1024, box.heightPx - top)
        ctx.clearRect(0, 0, 1024, 1024)
        ctx.drawImage(image, box.xPx + left, box.yPx + top, w, h, 0, 0, w, h)
        const pixels = ctx.getImageData(0, 0, w, h).data
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (!pixels[(y * w + x) * 4 + 3]) continue
          occupied++
          const col = Math.min(cols - 1, Math.floor((left + x) * cols / box.widthPx))
          const row = Math.min(rows - 1, Math.floor((top + y) * rows / box.heightPx))
          data[row * cols + col] = 1
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    canvas.width = canvas.height = 0
    if (!occupied) return null
    if (data.every((cell) => cell === 1)) return null
    // Don't place another item in an enclosed counter of a letter/logo.
    const external = new Uint8Array(data.length)
    const queue = new Int32Array(data.length)
    let head = 0, tail = 0
    const visit = (x: number, y: number) => {
      const i = y * cols + x
      if (!data[i] && !external[i]) { external[i] = 1; queue[tail++] = i }
    }
    for (let x = 0; x < cols; x++) { visit(x, 0); visit(x, rows - 1) }
    for (let y = 0; y < rows; y++) { visit(0, y); visit(cols - 1, y) }
    while (head < tail) {
      const i = queue[head++], x = i % cols, y = Math.floor(i / cols)
      if (x) visit(x - 1, y)
      if (x + 1 < cols) visit(x + 1, y)
      if (y) visit(x, y - 1)
      if (y + 1 < rows) visit(x, y + 1)
    }
    for (let i = 0; i < data.length; i++) if (!external[i]) data[i] = 1
    return { cols, rows, data }
  } catch {
    return null // Unknown alpha must be treated as a solid rectangle.
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface Shape {
  cols: number
  rows: number
  offsets: Int32Array // [column, row] for every occupied cell
}

const shapeCache = new WeakMap<OccupancyMask, Map<string, Shape>>()

/** Conservative area resampling: any source cell touching an output cell occupies it. */
export function shapeFor(mask: OccupancyMask | undefined, widthCm: number, heightCm: number, angle: number): Shape {
  const box = rotatedAabbCm(widthCm, heightCm, angle)
  const cols = Math.max(1, Math.ceil(box.wCm / CELL_CM))
  const rows = Math.max(1, Math.ceil(box.hCm / CELL_CM))
  const rotation = ((angle % 360) + 360) % 360
  const orthogonal = [0, 90, 180, 270].some((n) => Math.abs(n - rotation) < 0.00001)
  const key = `${widthCm}/${heightCm}/${rotation}`
  if (mask && orthogonal) {
    const cached = shapeCache.get(mask)?.get(key)
    if (cached) return cached
  }
  const data = new Uint8Array(cols * rows)
  if (!mask || !orthogonal) data.fill(1)
  else {
    // A source cell represents a region, not just its centre. Mark every grid
    // cell it intersects, including narrow lines and antialiased edges.
    for (let sy = 0; sy < mask.rows; sy++) for (let sx = 0; sx < mask.cols; sx++) {
      if (!mask.data[sy * mask.cols + sx]) continue
      let x0 = sx / mask.cols * widthCm, x1 = (sx + 1) / mask.cols * widthCm
      let y0 = sy / mask.rows * heightCm, y1 = (sy + 1) / mask.rows * heightCm
      if (rotation === 90) [x0, x1, y0, y1] = [heightCm - y1, heightCm - y0, x0, x1]
      else if (rotation === 180) [x0, x1, y0, y1] = [widthCm - x1, widthCm - x0, heightCm - y1, heightCm - y0]
      else if (rotation === 270) [x0, x1, y0, y1] = [y0, y1, widthCm - x1, widthCm - x0]
      const left = Math.max(0, Math.floor(x0 / CELL_CM))
      const top = Math.max(0, Math.floor(y0 / CELL_CM))
      const right = Math.min(cols - 1, Math.ceil(x1 / CELL_CM - 1e-9) - 1)
      const bottom = Math.min(rows - 1, Math.ceil(y1 / CELL_CM - 1e-9) - 1)
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) data[y * cols + x] = 1
    }
  }
  const offsets: number[] = []
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (data[y * cols + x]) offsets.push(x, y)
  const shape = { cols, rows, offsets: Int32Array.from(offsets) }
  if (mask && orthogonal) {
    let cache = shapeCache.get(mask)
    if (!cache) { cache = new Map(); shapeCache.set(mask, cache) }
    cache.set(key, shape)
  }
  return shape
}

/** For arbitrary manual positions, mark every sheet cell touched by an art cell. */
export function forEachSheetCell(item: PlacedItem, shape: Shape, visit: (x: number, y: number) => boolean | void): boolean {
  const x0 = item.xCm / CELL_CM, y0 = item.yCm / CELL_CM
  for (let k = 0; k < shape.offsets.length; k += 2) {
    const x = shape.offsets[k], y = shape.offsets[k + 1]
    for (let gy = Math.floor(y0 + y); gy < Math.ceil(y0 + y + 1 - 1e-9); gy++)
      for (let gx = Math.floor(x0 + x); gx < Math.ceil(x0 + x + 1 - 1e-9); gx++)
        if (visit(gx, gy)) return true
  }
  return false
}

export function clearanceOffsets(gapCm: number): Array<[number, number]> {
  if (gapCm <= 0) return [[0, 0]]
  const radius = Math.ceil(gapCm / CELL_CM) + 1
  const offsets: Array<[number, number]> = []
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    // Minimum possible distance between two occupied square cells.
    const distance = Math.hypot(Math.max(0, Math.abs(dx) - 1), Math.max(0, Math.abs(dy) - 1)) * CELL_CM
    if (distance < gapCm - 1e-8) offsets.push([dx, dy])
  }
  return offsets
}
