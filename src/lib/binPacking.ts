import { rotatedAabbCm } from '@/lib/geometry'
import { packImagesByShape } from '@/lib/packing/shapePacking'
import type { GangImage, PackedPage, PlacedItem } from '@/types'

export interface ImpossiblePackingItem {
  id: string
  name: string
  widthCm: number
  heightCm: number
  reason: string
}

export class PackingError extends Error {
  readonly impossibleItems: ImpossiblePackingItem[]

  constructor(message: string, impossibleItems: ImpossiblePackingItem[] = []) {
    super(message)
    this.name = 'PackingError'
    this.impossibleItems = impossibleItems
  }
}

/** Fails before packing instead of ever placing an item beyond sheet bounds. */
export function validatePackingRequest(
  images: GangImage[],
  maxHeightCm: number,
  canvasWidthCm: number,
  itemGapCm: number
): void {
  if (!Number.isFinite(canvasWidthCm) || canvasWidthCm <= 0 || !Number.isFinite(maxHeightCm) || maxHeightCm <= 0) {
    throw new PackingError('As dimensoes da folha precisam ser maiores que zero.')
  }
  if (!Number.isFinite(itemGapCm) || itemGapCm < 0) {
    throw new PackingError('O espacamento entre artes precisa ser zero ou maior.')
  }

  const impossibleItems: ImpossiblePackingItem[] = []
  for (const image of images) {
    let reason = ''
    if (!Number.isFinite(image.widthCm) || !Number.isFinite(image.heightCm) || image.widthCm <= 0 || image.heightCm <= 0) {
      reason = 'dimensoes invalidas'
    } else if (!Number.isInteger(image.quantity) || image.quantity < 1) {
      reason = 'quantidade invalida'
    } else {
      const fitsOriginal = image.widthCm <= canvasWidthCm + 1e-9 && image.heightCm <= maxHeightCm + 1e-9
      const fitsRotated = image.heightCm <= canvasWidthCm + 1e-9 && image.widthCm <= maxHeightCm + 1e-9
      if (!fitsOriginal && !fitsRotated) reason = 'maior que a folha nas duas orientacoes'
    }
    if (reason) {
      impossibleItems.push({
        id: image.id,
        name: image.file?.name || image.id,
        widthCm: image.widthCm,
        heightCm: image.heightCm,
        reason,
      })
    }
  }

  if (impossibleItems.length > 0) {
    const names = impossibleItems.map((item) => item.name).join(', ')
    throw new PackingError(`Estas artes nao cabem na folha: ${names}.`, impossibleItems)
  }
}

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
 * Each item is tried in both orientations (original and rotated 90°) and the
 * tighter of the two wins, so tall art can lie on its side to fill a wide gap.
 * The chosen orientation is reported back via `rotated`; the renderer draws the
 * art at the matching angle, so the packed box always matches what's on screen.
 */
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
  // Only bother with the rotated orientation when it's actually different.
  if (Math.abs(width - height) > 0.001) {
    tryFit(height, width, true)
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
 * - Each item may be auto-rotated 90° when that orientation fills the space
 *   better. `widthCm`/`heightCm` on the result always stay the art's real
 *   (unrotated) size; `angle` records the orientation and `xCm`/`yCm` are the
 *   top-left of the on-sheet bounding box. The renderer reads all three, so the
 *   drawn art matches the reserved box exactly. Sizes are never changed.
 */
export function packImagesMaxRects(
  images: GangImage[],
  maxHeightCm: number,
  canvasWidthCm: number,
  itemGapCm: number
): PackedPage[] {
  validatePackingRequest(images, maxHeightCm, canvasWidthCm, itemGapCm)
  const units = expandQueue(images).sort((a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm)

  const buckets: PageBucket[] = []

  const openNewBucket = (): PageBucket => {
    const bucket: PageBucket = {
      items: [],
      // The virtual extra gap on the right/bottom keeps the configured gap
      // between rectangles without requiring blank space at sheet edges.
      freeRects: [{ x: 0, y: 0, width: canvasWidthCm + itemGapCm, height: maxHeightCm + itemGapCm }],
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
      const fit = findBestFit(bucket.freeRects, occupiedWidth, occupiedHeight)
      // validatePackingRequest guarantees at least one orientation fits.
      if (!fit) throw new PackingError(`A arte ${unit.sourceImageId} nao coube em uma folha vazia.`)
      target = { bucket, rect: fit.rect, rotated: fit.rotated }
    }

    const { bucket, rect, rotated } = target
    // widthCm/heightCm stay the art's real size; the on-sheet box swaps sides
    // when the item is rotated 90°.
    const boxWidth = rotated ? itemHeight : itemWidth
    const boxHeight = rotated ? itemWidth : itemHeight
    const used: FreeRect = { x: rect.x, y: rect.y, width: boxWidth + itemGapCm, height: boxHeight + itemGapCm }

    bucket.items.push({
      id: unit.id,
      sourceImageId: unit.sourceImageId,
      previewUrl: unit.previewUrl,
      xCm: rect.x,
      yCm: rect.y,
      widthCm: itemWidth,
      heightCm: itemHeight,
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
    // Bottom edge uses the on-sheet box height, which is the art's width when rotated.
    usedHeightCm: bucket.items.reduce(
      (max, it) => Math.max(max, it.yCm + rotatedAabbCm(it.widthCm, it.heightCm, it.angle).hCm),
      0
    ),
  }))
}

/**
 * Uses real alpha/colour silhouettes when available. MaxRects remains the
 * deterministic fallback for old items, very large jobs, or grid limits.
 */
export function packImages(
  images: GangImage[],
  maxHeightCm: number,
  canvasWidthCm: number,
  itemGapCm: number
): PackedPage[] {
  validatePackingRequest(images, maxHeightCm, canvasWidthCm, itemGapCm)
  if (images.some((image) => image.packingMask)) {
    const shapePacked = packImagesByShape(images, maxHeightCm, canvasWidthCm, itemGapCm)
    if (shapePacked) return shapePacked
  }
  return packImagesMaxRects(images, maxHeightCm, canvasWidthCm, itemGapCm)
}
