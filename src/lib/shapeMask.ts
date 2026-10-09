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
          const x0 = Math.floor((left + x) * cols / box.widthPx)
          const y0 = Math.floor((top + y) * rows / box.heightPx)
          const x1 = Math.min(cols, Math.ceil((left + x + 1) * cols / box.widthPx))
          const y1 = Math.min(rows, Math.ceil((top + y + 1) * rows / box.heightPx))
          for (let gy = y0; gy < y1; gy++) for (let gx = x0; gx < x1; gx++) data[gy * cols + gx] = 1
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
    return data.every(cell => cell === 1) ? null : { cols, rows, data }
  } catch {
    return null // Unknown alpha must be treated as a solid rectangle.
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface Shape {
  cols: number
  rows: number
  stride: number
  words: Uint32Array
}

type Point = [number, number]
const shapeCache = new WeakMap<OccupancyMask, Map<string, Shape>>()

function clipAtY(points: Point[], edge: number, above: boolean): Point[] {
  const result: Point[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    const insideA = above ? a[1] >= edge : a[1] <= edge
    const insideB = above ? b[1] >= edge : b[1] <= edge
    if (insideA) result.push(a)
    if (insideA !== insideB) {
      const t = (edge - a[1]) / (b[1] - a[1])
      result.push([a[0] + t * (b[0] - a[0]), edge])
    }
  }
  return result
}

/** Rasterize the full area of each source run, with the same centre as export.
 * Scanline clipping preserves fine lines at every angle; no point sampling.
 */
export function shapeFor(mask: OccupancyMask | undefined, widthCm: number, heightCm: number, angle: number): Shape {
  const rotation = ((angle % 360) + 360) % 360
  const key = `${widthCm}/${heightCm}/${rotation}`
  const cached = mask && shapeCache.get(mask)?.get(key)
  if (cached) return cached
  const box = rotatedAabbCm(widthCm, heightCm, rotation)
  const cols = Math.max(1, Math.ceil(box.wCm / CELL_CM - 1e-9))
  const rows = Math.max(1, Math.ceil(box.hCm / CELL_CM - 1e-9))
  const stride = Math.ceil(cols / 32)
  const shape: Shape = { cols, rows, stride, words: new Uint32Array(stride * rows) }
  const rad = rotation * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad)
  const transform = (x: number, y: number): Point => [
    ((x - widthCm / 2) * c - (y - heightCm / 2) * s + box.wCm / 2) / CELL_CM,
    ((x - widthCm / 2) * s + (y - heightCm / 2) * c + box.hCm / 2) / CELL_CM,
  ]
  const rasterRect = (x0: number, y0: number, x1: number, y1: number) => {
    const polygon = [transform(x0, y0), transform(x1, y0), transform(x1, y1), transform(x0, y1)]
    const top = Math.max(0, Math.floor(Math.min(...polygon.map(p => p[1])) + 1e-9))
    const bottom = Math.min(rows, Math.ceil(Math.max(...polygon.map(p => p[1])) - 1e-9))
    for (let y = top; y < bottom; y++) {
      const band = clipAtY(clipAtY(polygon, y, true), y + 1, false)
      if (!band.length) continue
      const left = Math.max(0, Math.floor(Math.min(...band.map(p => p[0])) + 1e-9))
      const right = Math.min(cols, Math.ceil(Math.max(...band.map(p => p[0])) - 1e-9))
      for (let x = left; x < right; x++) shape.words[y * stride + (x >>> 5)] |= 1 << (x & 31)
    }
  }
  if (!mask) rasterRect(0, 0, widthCm, heightCm)
  else for (let sy = 0; sy < mask.rows; sy++) {
    for (let sx = 0; sx < mask.cols;) {
      if (!mask.data[sy * mask.cols + sx]) { sx++; continue }
      const start = sx++
      while (sx < mask.cols && mask.data[sy * mask.cols + sx]) sx++
      rasterRect(start / mask.cols * widthCm, sy / mask.rows * heightCm,
        sx / mask.cols * widthCm, (sy + 1) / mask.rows * heightCm)
    }
  }
  if (mask) {
    let cache = shapeCache.get(mask)
    if (!cache) { cache = new Map(); shapeCache.set(mask, cache) }
    if (cache.size >= 48) cache.delete(cache.keys().next().value!)
    cache.set(key, shape)
  }
  return shape
}

export function forEachCell(shape: Shape, visit: (x: number, y: number) => boolean | void): boolean {
  for (let y = 0; y < shape.rows; y++) for (let w = 0; w < shape.stride; w++) {
    let bits = shape.words[y * shape.stride + w]
    while (bits) {
      const bit = 31 - Math.clz32(bits & -bits)
      if (visit(w * 32 + bit, y)) return true
      bits = (bits & (bits - 1)) >>> 0
    }
  }
  return false
}

/** Conservative translation, including fractional positions from manual edits. */
export function forEachSheetCell(item: PlacedItem, shape: Shape, visit: (x: number, y: number) => boolean | void): boolean {
  const x0 = item.xCm / CELL_CM, y0 = item.yCm / CELL_CM
  return forEachCell(shape, (x, y) => {
    for (let gy = Math.floor(y0 + y + 1e-9); gy < Math.ceil(y0 + y + 1 - 1e-9); gy++)
      for (let gx = Math.floor(x0 + x + 1e-9); gx < Math.ceil(x0 + x + 1 - 1e-9); gx++)
        if (visit(gx, gy)) return true
  })
}

export function clearanceOffsets(gapCm: number): Array<[number, number]> {
  if (gapCm <= 0) return [[0, 0]]
  const radius = Math.ceil(gapCm / CELL_CM) + 1
  const offsets: Array<[number, number]> = []
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const distance = Math.hypot(Math.max(0, Math.abs(dx) - 1), Math.max(0, Math.abs(dy) - 1)) * CELL_CM
    if (distance < gapCm - 1e-8) offsets.push([dx, dy])
  }
  return offsets
}
