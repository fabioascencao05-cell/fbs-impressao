import type { GangImage, PackedPage, PlacedItem } from '@/types'

interface PackableUnit {
  id: string
  sourceImageId: string
  previewUrl: string
  widthCm: number
  heightCm: number
  contentXPx: number
  contentYPx: number
  contentWidthPx: number
  contentHeightPx: number
  naturalWidthPx: number
  naturalHeightPx: number
}

interface FreeRect {
  x: number
  y: number
  width: number
  height: number
}

interface PageBucket {
  items: PlacedItem[]
  freeRects: FreeRect[]
}

/**
 * Expands each queued image into `quantity` individual units to be packed
 * onto the gang sheet independently.
 */
function expandQueue(images: GangImage[]): PackableUnit[] {
  const units: PackableUnit[] = []
  for (const img of images) {
    for (let i = 0; i < img.quantity; i++) {
      units.push({
        id: `${img.id}-${i}`,
        sourceImageId: img.id,
        previewUrl: img.previewUrl,
        widthCm: img.widthCm,
        heightCm: img.heightCm,
        contentXPx: img.contentXPx,
        contentYPx: img.contentYPx,
        contentWidthPx: img.contentWidthPx,
        contentHeightPx: img.contentHeightPx,
        naturalWidthPx: img.naturalWidthPx,
        naturalHeightPx: img.naturalHeightPx,
      })
    }
  }
  return units
}

function rectContains(a: FreeRect, b: FreeRect): boolean {
  // True if free rect `b` is fully contained within `a` (and thus redundant).
  return b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height
}

/**
 * Splits every free rectangle that overlaps `used` into the leftover
 * (non-covered) pieces, then prunes any free rectangle fully contained
 * within another. Standard MaxRects free-space maintenance.
 */
function splitFreeRects(freeRects: FreeRect[], used: FreeRect): FreeRect[] {
  const next: FreeRect[] = []

  for (const f of freeRects) {
    const overlaps =
      used.x < f.x + f.width && used.x + used.width > f.x && used.y < f.y + f.height && used.y + used.height > f.y

    if (!overlaps) {
      next.push(f)
      continue
    }

    if (used.x > f.x) {
      next.push({ x: f.x, y: f.y, width: used.x - f.x, height: f.height })
    }
    if (used.x + used.width < f.x + f.width) {
      next.push({
        x: used.x + used.width,
        y: f.y,
        width: f.x + f.width - (used.x + used.width),
        height: f.height,
      })
    }
    if (used.y > f.y) {
      next.push({ x: f.x, y: f.y, width: f.width, height: used.y - f.y })
    }
    if (used.y + used.height < f.y + f.height) {
      next.push({
        x: f.x,
        y: used.y + used.height,
        width: f.width,
        height: f.y + f.height - (used.y + used.height),
      })
    }
  }

  // Prune degenerate and contained rectangles.
  const cleaned = next.filter((r) => r.width > 0.001 && r.height > 0.001)
  const pruned: FreeRect[] = []
  for (let i = 0; i < cleaned.length; i++) {
    let contained = false
    for (let j = 0; j < cleaned.length; j++) {
      if (i !== j && rectContains(cleaned[j], cleaned[i])) {
        contained = true
        break
      }
    }
    if (!contained) pruned.push(cleaned[i])
  }
  return pruned
}

/** Best Short Side Fit: among all free rects that fit, pick the tightest one. */
function findBestFit(
  freeRects: FreeRect[],
  width: number,
  height: number
): { rect: FreeRect; shortSide: number; longSide: number; rotated: boolean } | null {
  let best: { rect: FreeRect; shortSide: number; longSide: number; rotated: boolean } | null = null

  const tryFit = (w: number, h: number, rotated: boolean) => {
    for (const rect of freeRects) {
      if (rect.width < w || rect.height < h) continue
      const leftoverW = rect.width - w
      const leftoverH = rect.height - h
      const shortSide = Math.min(leftoverW, leftoverH)
      const longSide = Math.max(leftoverW, leftoverH)
      if (!best || shortSide < best.shortSide || (shortSide === best.shortSide && longSide < best.longSide)) {
        best = { rect, shortSide, longSide, rotated }
      }
    }
  }

  tryFit(width, height, false)
  if (Math.abs(width - height) > 0.001) {
    tryFit(height, width, true)
  }
  return best
}

/**
 * Runs one full MaxRects (Best Short Side Fit) pass over an already-ordered
 * list of units and returns the resulting pages. Extracted so the public
 * packer can try several orderings and keep the most material-efficient one.
 * Rotation (90°) is attempted per item whenever it yields a tighter fit.
 */
function packUnits(
  units: PackableUnit[],
  maxHeightCm: number,
  canvasWidthCm: number,
  itemGapCm: number
): PackedPage[] {
  const buckets: PageBucket[] = []

  const openNewBucket = (): PageBucket => {
    const bucket: PageBucket = {
      items: [],
      freeRects: [{ x: 0, y: 0, width: canvasWidthCm, height: maxHeightCm }],
    }
    buckets.push(bucket)
    return bucket
  }

  for (const unit of units) {
    const itemWidth = unit.widthCm
    const itemHeight = unit.heightCm
    const occupiedWidth = itemWidth + itemGapCm
    const occupiedHeight = itemHeight + itemGapCm

    let target: { bucket: PageBucket; rect: FreeRect; rotated: boolean } | null = null
    let bestShortSide = Infinity
    let bestLongSide = Infinity

    for (const bucket of buckets) {
      const fit = findBestFit(bucket.freeRects, occupiedWidth, occupiedHeight)
      if (!fit) continue
      if (fit.shortSide < bestShortSide || (fit.shortSide === bestShortSide && fit.longSide < bestLongSide)) {
        target = { bucket, rect: fit.rect, rotated: fit.rotated }
        bestShortSide = fit.shortSide
        bestLongSide = fit.longSide
      }
    }

    if (!target) {
      const bucket = openNewBucket()
      // On a fresh sheet, still allow rotation if the item only fits rotated
      // (taller than the sheet in its natural orientation but not when turned).
      const fit = findBestFit(bucket.freeRects, occupiedWidth, occupiedHeight)
      target = { bucket, rect: bucket.freeRects[0], rotated: fit?.rotated ?? false }
    }

    const { bucket, rect, rotated } = target
    const placedW = rotated ? itemHeight : itemWidth
    const placedH = rotated ? itemWidth : itemHeight
    const used: FreeRect = { x: rect.x, y: rect.y, width: placedW + itemGapCm, height: placedH + itemGapCm }

    bucket.items.push({
      id: unit.id,
      sourceImageId: unit.sourceImageId,
      previewUrl: unit.previewUrl,
      xCm: rect.x,
      yCm: rect.y,
      widthCm: placedW,
      heightCm: placedH,
      angle: rotated ? 90 : 0,
      contentXPx: unit.contentXPx,
      contentYPx: unit.contentYPx,
      contentWidthPx: unit.contentWidthPx,
      contentHeightPx: unit.contentHeightPx,
      naturalWidthPx: unit.naturalWidthPx,
      naturalHeightPx: unit.naturalHeightPx,
    })

    bucket.freeRects = splitFreeRects(bucket.freeRects, used)
  }

  if (buckets.length === 0) openNewBucket()

  return buckets.map((bucket, index) => ({
    index,
    items: bucket.items,
    usedHeightCm: bucket.items.reduce((max, it) => Math.max(max, it.yCm + it.heightCm), 0),
  }))
}

/**
 * Total linear length consumed across every page. This is exactly what the
 * per-meter price is charged on, so minimizing it minimizes both wasted
 * material and cost — our packing-quality score (lower is better).
 */
function totalUsedLength(pages: PackedPage[]): number {
  return pages.reduce((sum, p) => sum + p.usedHeightCm, 0)
}

// Candidate unit orderings. MaxRects is sensitive to insertion order, and no
// single sort wins on every input, so we pack with each and keep the tightest.
const SORT_STRATEGIES: ((a: PackableUnit, b: PackableUnit) => number)[] = [
  (a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm, // area desc
  (a, b) => b.heightCm - a.heightCm, // tallest first
  (a, b) => b.widthCm - a.widthCm, // widest first
  (a, b) => Math.max(b.widthCm, b.heightCm) - Math.max(a.widthCm, a.heightCm), // longest side desc
]

/**
 * Material-efficient bin packing for the gang sheet.
 *
 * Expands the queue into individual units, then packs them with MaxRects
 * (Best Short Side Fit) under several unit orderings — keeping whichever
 * layout consumes the least total linear length (i.e. the cheapest, most
 * economical result). Each item may be rotated 90° when that produces a
 * tighter fit. A new page opens only when a unit fits nowhere on the open
 * sheets, so gaps beside and below placed art stay usable for smaller pieces.
 */
export function packImages(
  images: GangImage[],
  maxHeightCm: number,
  canvasWidthCm: number,
  itemGapCm: number
): PackedPage[] {
  const base = expandQueue(images)
  if (base.length === 0) return packUnits(base, maxHeightCm, canvasWidthCm, itemGapCm)

  let best: PackedPage[] | null = null
  let bestScore = Infinity

  for (const strategy of SORT_STRATEGIES) {
    const ordered = [...base].sort(strategy)
    const pages = packUnits(ordered, maxHeightCm, canvasWidthCm, itemGapCm)
    // Fewer pages first, then least total length — a tie in length prefers
    // the layout that uses fewer physical sheets.
    const score = pages.length * 1_000_000 + totalUsedLength(pages)
    if (score < bestScore) {
      best = pages
      bestScore = score
    }
  }

  return best ?? packUnits(base, maxHeightCm, canvasWidthCm, itemGapCm)
}
