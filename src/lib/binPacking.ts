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

/**
 * Best Short Side Fit: among all free rects that fit, pick the tightest one.
 * Items are always placed in their original orientation — the packer never
 * rotates, so the on-canvas renderer (which draws every packed item at angle 0)
 * always receives a box whose size matches exactly what was reserved here.
 */
function findBestFit(
  freeRects: FreeRect[],
  width: number,
  height: number
): { rect: FreeRect; shortSide: number; longSide: number } | null {
  let best: { rect: FreeRect; shortSide: number; longSide: number } | null = null

  for (const rect of freeRects) {
    if (rect.width < width || rect.height < height) continue
    const leftoverW = rect.width - width
    const leftoverH = rect.height - height
    const shortSide = Math.min(leftoverW, leftoverH)
    const longSide = Math.max(leftoverW, leftoverH)
    if (!best || shortSide < best.shortSide || (shortSide === best.shortSide && longSide < best.longSide)) {
      best = { rect, shortSide, longSide }
    }
  }

  return best
}

/**
 * MaxRects bin packing (Best Short Side Fit heuristic):
 * - Each page tracks its free rectangular space (starting as the whole
 *   canvasWidthCm × maxHeightCm sheet).
 * - Items are sorted by area (largest first) and placed into whichever
 *   already-open page offers the tightest fit; a new page opens only when
 *   nothing fits anywhere.
 * - Placing an item splits/prunes the free rectangle list so leftover gaps
 *   next to and below it stay available for smaller items later — unlike
 *   shelf packing, nothing is wasted just because it doesn't share a row.
 * - Rotation is never attempted: every item is placed in its original
 *   orientation at angle 0, so the packed box always matches how the canvas
 *   renderer draws it. Rotation stays a manual, on-canvas action.
 */
export function packImages(
  images: GangImage[],
  maxHeightCm: number,
  canvasWidthCm: number,
  itemGapCm: number
): PackedPage[] {
  const units = expandQueue(images).sort((a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm)

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

    let target: { bucket: PageBucket; rect: FreeRect } | null = null
    let bestShortSide = Infinity
    let bestLongSide = Infinity

    for (const bucket of buckets) {
      const fit = findBestFit(bucket.freeRects, occupiedWidth, occupiedHeight)
      if (!fit) continue
      if (fit.shortSide < bestShortSide || (fit.shortSide === bestShortSide && fit.longSide < bestLongSide)) {
        target = { bucket, rect: fit.rect }
        bestShortSide = fit.shortSide
        bestLongSide = fit.longSide
      }
    }

    if (!target) {
      const bucket = openNewBucket()
      target = { bucket, rect: bucket.freeRects[0] }
    }

    const { bucket, rect } = target
    const placedW = itemWidth
    const placedH = itemHeight
    const used: FreeRect = { x: rect.x, y: rect.y, width: placedW + itemGapCm, height: placedH + itemGapCm }

    bucket.items.push({
      id: unit.id,
      sourceImageId: unit.sourceImageId,
      previewUrl: unit.previewUrl,
      xCm: rect.x,
      yCm: rect.y,
      widthCm: placedW,
      heightCm: placedH,
      angle: 0,
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
