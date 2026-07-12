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

interface Placement {
  bucket: PageBucket
  x: number
  y: number
  rotated: boolean
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

// Two positions are treated as the same "row"/"column" when within this many
// cm of each other, so tiny float noise doesn't scatter otherwise-aligned art.
const ALIGN_EPS = 0.05

/**
 * Bottom-Left-Fill placement for a single orientation (w × h already include
 * the cutting gap). Among every free rect the piece fits into, it picks the
 * top-most position, then the left-most, then the tightest leftover area —
 * so pieces stack into neat, dense rows from the top-left corner instead of
 * being scattered across the sheet. Returns the chosen top-left corner, or
 * null if the piece fits nowhere in the given buckets.
 */
function findBottomLeftPlacement(buckets: PageBucket[], w: number, h: number, rotated: boolean): Placement | null {
  let best: Placement | null = null
  let bestY = Infinity
  let bestX = Infinity
  let bestWaste = Infinity

  for (const bucket of buckets) {
    for (const rect of bucket.freeRects) {
      if (rect.width + ALIGN_EPS < w || rect.height + ALIGN_EPS < h) continue
      const waste = (rect.width - w) * (rect.height - h)
      const y = rect.y
      const x = rect.x
      const better =
        y < bestY - ALIGN_EPS ||
        (Math.abs(y - bestY) <= ALIGN_EPS && x < bestX - ALIGN_EPS) ||
        (Math.abs(y - bestY) <= ALIGN_EPS && Math.abs(x - bestX) <= ALIGN_EPS && waste < bestWaste)
      if (!best || better) {
        best = { bucket, x, y, rotated }
        bestY = y
        bestX = x
        bestWaste = waste
      }
    }
  }
  return best
}

/**
 * Finds the best placement for one unit across the given buckets, preferring
 * the upright orientation. Rotation is only attempted when the piece fits
 * nowhere upright — so art keeps its natural orientation for clean, readable
 * rows and only turns sideways when that is what avoids opening a new sheet.
 */
function placeUnit(
  buckets: PageBucket[],
  widthCm: number,
  heightCm: number,
  gap: number
): { placement: Placement; placedW: number; placedH: number } | null {
  const upright = findBottomLeftPlacement(buckets, widthCm + gap, heightCm + gap, false)
  if (upright) return { placement: upright, placedW: widthCm, placedH: heightCm }

  if (Math.abs(widthCm - heightCm) > 0.001) {
    const turned = findBottomLeftPlacement(buckets, heightCm + gap, widthCm + gap, true)
    if (turned) return { placement: turned, placedW: heightCm, placedH: widthCm }
  }
  return null
}

/**
 * MaxRects bin packing with a Bottom-Left-Fill heuristic:
 * - Each page tracks its free rectangular space (starting as the whole
 *   canvasWidthCm × maxHeightCm sheet).
 * - Items are packed on their real artwork size (the trimmed content box, so
 *   transparent padding never counts) plus the user's manual gap, largest
 *   first, into the top-most / left-most spot that fits on any open page.
 * - Placing an item splits/prunes the free rectangle list so leftover gaps
 *   next to and below it stay available for smaller items later — nothing is
 *   wasted just because it doesn't share a row.
 * - Rotation is a fallback only: a piece stays upright unless it fits nowhere
 *   upright on the existing pages, in which case turning it 90° may avoid
 *   opening a new sheet. This keeps layouts dense but predictable instead of
 *   flipping art arbitrarily.
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
    let result = placeUnit(buckets, unit.widthCm, unit.heightCm, itemGapCm)

    if (!result) {
      // Nothing fits on the open pages — start a fresh sheet and place there.
      const bucket = openNewBucket()
      result = placeUnit([bucket], unit.widthCm, unit.heightCm, itemGapCm)
      if (!result) {
        // Larger than the sheet even when turned: anchor it at the origin so
        // the art is never silently dropped from the layout.
        result = {
          placement: { bucket, x: 0, y: 0, rotated: false },
          placedW: unit.widthCm,
          placedH: unit.heightCm,
        }
      }
    }

    const { placement, placedW, placedH } = result
    const { bucket, x, y, rotated } = placement
    const used: FreeRect = { x, y, width: placedW + itemGapCm, height: placedH + itemGapCm }

    bucket.items.push({
      id: unit.id,
      sourceImageId: unit.sourceImageId,
      previewUrl: unit.previewUrl,
      xCm: x,
      yCm: y,
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
