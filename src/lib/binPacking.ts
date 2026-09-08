import { rotatedAabbCm } from '@/lib/geometry'
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
  usedHeightCm: number
}

type SortStrategy = 'area' | 'max-side' | 'min-side' | 'height' | 'width' | 'perimeter' | 'aspect'
type FitStrategy = 'film-height' | 'bottom-left' | 'short-side' | 'long-side' | 'area'

interface Candidate {
  pages: PackedPage[]
  unplaced: PackingResult['unplaced']
  name: string
}

export interface PackingResult {
  pages: PackedPage[]
  /** Arts that cannot physically fit on a blank page at their chosen size. */
  unplaced: Array<{ sourceImageId: string; widthCm: number; heightCm: number }>
  /** Human-readable diagnostic that makes packing decisions debuggable. */
  strategy: string
}

const EPSILON = 0.0001
const END_MARGIN_CM = 0.1

/** Expands quantities into individually placeable units. */
function expandQueue(images: GangImage[]): PackableUnit[] {
  const units: PackableUnit[] = []
  for (const image of images) {
    for (let copy = 0; copy < image.quantity; copy++) {
      units.push({
        id: `${image.id}-${copy}`,
        sourceImageId: image.id,
        previewUrl: image.previewUrl,
        widthCm: image.widthCm,
        heightCm: image.heightCm,
        contentXPx: image.contentXPx,
        contentYPx: image.contentYPx,
        contentWidthPx: image.contentWidthPx,
        contentHeightPx: image.contentHeightPx,
        naturalWidthPx: image.naturalWidthPx,
        naturalHeightPx: image.naturalHeightPx,
      })
    }
  }
  return units
}

function sortUnits(units: PackableUnit[], strategy: SortStrategy): PackableUnit[] {
  return [...units].sort((a, b) => {
    const areaA = a.widthCm * a.heightCm
    const areaB = b.widthCm * b.heightCm
    const maxA = Math.max(a.widthCm, a.heightCm)
    const maxB = Math.max(b.widthCm, b.heightCm)
    const minA = Math.min(a.widthCm, a.heightCm)
    const minB = Math.min(b.widthCm, b.heightCm)
    const perimeterA = a.widthCm + a.heightCm
    const perimeterB = b.widthCm + b.heightCm
    const aspectA = maxA / Math.max(minA, EPSILON)
    const aspectB = maxB / Math.max(minB, EPSILON)
    const primary =
      strategy === 'area'
        ? areaB - areaA
        : strategy === 'max-side'
          ? maxB - maxA
          : strategy === 'min-side'
            ? minB - minA
            : strategy === 'height'
              ? b.heightCm - a.heightCm
              : strategy === 'width'
                ? b.widthCm - a.widthCm
                : strategy === 'perimeter'
                  ? perimeterB - perimeterA
                  : aspectB - aspectA
    if (Math.abs(primary) > EPSILON) return primary
    if (Math.abs(areaB - areaA) > EPSILON) return areaB - areaA
    return a.id.localeCompare(b.id)
  })
}

function rectContains(outer: FreeRect, inner: FreeRect): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    inner.x + inner.width <= outer.x + outer.width + EPSILON &&
    inner.y + inner.height <= outer.y + outer.height + EPSILON
  )
}

/** Maintains the non-overlapping free rectangles used by MaxRects. */
function splitFreeRects(freeRects: FreeRect[], used: FreeRect): FreeRect[] {
  const next: FreeRect[] = []
  for (const free of freeRects) {
    const overlaps =
      used.x < free.x + free.width - EPSILON &&
      used.x + used.width > free.x + EPSILON &&
      used.y < free.y + free.height - EPSILON &&
      used.y + used.height > free.y + EPSILON
    if (!overlaps) {
      next.push(free)
      continue
    }
    if (used.x > free.x + EPSILON) next.push({ x: free.x, y: free.y, width: used.x - free.x, height: free.height })
    if (used.x + used.width < free.x + free.width - EPSILON) {
      next.push({ x: used.x + used.width, y: free.y, width: free.x + free.width - (used.x + used.width), height: free.height })
    }
    if (used.y > free.y + EPSILON) next.push({ x: free.x, y: free.y, width: free.width, height: used.y - free.y })
    if (used.y + used.height < free.y + free.height - EPSILON) {
      next.push({ x: free.x, y: used.y + used.height, width: free.width, height: free.y + free.height - (used.y + used.height) })
    }
  }

  const cleaned = next.filter((rect) => rect.width > EPSILON && rect.height > EPSILON)
  return cleaned.filter((rect, index) => !cleaned.some((other, otherIndex) => otherIndex !== index && rectContains(other, rect)))
}

interface Fit {
  rect: FreeRect
  rotated: boolean
  primary: number
  secondary: number
  tertiary: number
}

function compareFit(a: Fit, b: Fit): number {
  for (const key of ['primary', 'secondary', 'tertiary'] as const) {
    if (a[key] < b[key] - EPSILON) return -1
    if (a[key] > b[key] + EPSILON) return 1
  }
  if (a.rect.y < b.rect.y - EPSILON) return -1
  if (a.rect.y > b.rect.y + EPSILON) return 1
  if (a.rect.x < b.rect.x - EPSILON) return -1
  if (a.rect.x > b.rect.x + EPSILON) return 1
  return Number(a.rotated) - Number(b.rotated)
}

/**
 * Tries original and 90° orientations in every free rectangle. Multiple fit
 * heuristics are used in separate packing passes; comparing those passes is
 * much more reliable for mixed artwork than one fixed input order.
 */
function findBestFit(
  freeRects: FreeRect[],
  width: number,
  height: number,
  itemGapCm: number,
  currentUsedHeightCm: number,
  strategy: FitStrategy
): Fit | null {
  let best: Fit | null = null

  const consider = (placedWidth: number, placedHeight: number, rotated: boolean) => {
    const reservedWidth = placedWidth + itemGapCm
    const reservedHeight = placedHeight + itemGapCm
    for (const rect of freeRects) {
      if (rect.width + EPSILON < reservedWidth || rect.height + EPSILON < reservedHeight) continue
      const leftoverWidth = rect.width - reservedWidth
      const leftoverHeight = rect.height - reservedHeight
      const shortSide = Math.min(leftoverWidth, leftoverHeight)
      const longSide = Math.max(leftoverWidth, leftoverHeight)
      const wastedArea = rect.width * rect.height - reservedWidth * reservedHeight
      const bottom = rect.y + placedHeight
      const heightGrowth = Math.max(0, bottom - currentUsedHeightCm)
      let primary: number
      let secondary: number
      let tertiary: number

      if (strategy === 'film-height') {
        // The printer charges by film length. Prefer holes that add no height,
        // even when a locally tighter rectangle exists lower in another page.
        primary = heightGrowth
        secondary = bottom
        tertiary = wastedArea
      } else if (strategy === 'bottom-left') {
        primary = bottom
        secondary = rect.x
        tertiary = wastedArea
      } else if (strategy === 'area') {
        primary = wastedArea
        secondary = shortSide
        tertiary = bottom
      } else if (strategy === 'long-side') {
        primary = longSide
        secondary = shortSide
        tertiary = bottom
      } else {
        primary = shortSide
        secondary = longSide
        tertiary = bottom
      }

      const candidate = { rect, rotated, primary, secondary, tertiary }
      if (!best || compareFit(candidate, best) < 0) best = candidate
    }
  }

  consider(width, height, false)
  if (Math.abs(width - height) > EPSILON) consider(height, width, true)
  return best
}

function buildPages(buckets: PageBucket[]): PackedPage[] {
  return buckets.map((bucket, index) => ({
    index,
    items: bucket.items,
    usedHeightCm: bucket.usedHeightCm,
  }))
}

function packWithStrategy(
  units: PackableUnit[],
  maxHeightCm: number,
  canvasWidthCm: number,
  itemGapCm: number,
  sortStrategy: SortStrategy,
  fitStrategy: FitStrategy
): Candidate {
  const buckets: PageBucket[] = []
  const unplaced: PackingResult['unplaced'] = []
  const openBucket = (): PageBucket => {
    // Each art reserves its spacing on the right/bottom.  The extra outer gap
    // lets one art use the sheet edge while preserving the requested gap between
    // two neighbouring arts.
    const bucket: PageBucket = {
      items: [],
      freeRects: [{ x: 0, y: 0, width: canvasWidthCm + itemGapCm, height: maxHeightCm + itemGapCm }],
      usedHeightCm: 0,
    }
    buckets.push(bucket)
    return bucket
  }

  for (const unit of sortUnits(units, sortStrategy)) {
    let target: { bucket: PageBucket; fit: Fit } | null = null

    for (const bucket of buckets) {
      const fit = findBestFit(bucket.freeRects, unit.widthCm, unit.heightCm, itemGapCm, bucket.usedHeightCm, fitStrategy)
      if (!fit) continue
      if (!target || compareFit(fit, target.fit) < 0) {
        target = { bucket, fit }
      }
    }

    if (!target) {
      const bucket = openBucket()
      const fit = findBestFit(bucket.freeRects, unit.widthCm, unit.heightCm, itemGapCm, bucket.usedHeightCm, fitStrategy)
      if (!fit) {
        buckets.pop()
        unplaced.push({ sourceImageId: unit.sourceImageId, widthCm: unit.widthCm, heightCm: unit.heightCm })
        continue
      }
      target = { bucket, fit }
    }

    const { bucket, fit } = target
    const angle = fit.rotated ? 90 : 0
    const box = rotatedAabbCm(unit.widthCm, unit.heightCm, angle)
    const used: FreeRect = { x: fit.rect.x, y: fit.rect.y, width: box.wCm + itemGapCm, height: box.hCm + itemGapCm }

    bucket.items.push({
      id: unit.id,
      sourceImageId: unit.sourceImageId,
      previewUrl: unit.previewUrl,
      xCm: fit.rect.x,
      yCm: fit.rect.y,
      widthCm: unit.widthCm,
      heightCm: unit.heightCm,
      angle,
      contentXPx: unit.contentXPx,
      contentYPx: unit.contentYPx,
      contentWidthPx: unit.contentWidthPx,
      contentHeightPx: unit.contentHeightPx,
      naturalWidthPx: unit.naturalWidthPx,
      naturalHeightPx: unit.naturalHeightPx,
    })
    bucket.freeRects = splitFreeRects(bucket.freeRects, used)
    bucket.usedHeightCm = Math.max(bucket.usedHeightCm, fit.rect.y + box.hCm)
  }

  return { pages: buildPages(buckets), unplaced, name: `${sortStrategy}/${fitStrategy}` }
}

function candidateScore(candidate: Candidate): [number, number, number] {
  const totalHeight = candidate.pages.reduce((sum, page) => sum + page.usedHeightCm + END_MARGIN_CM, 0)
  return [candidate.unplaced.length, totalHeight, candidate.pages.length]
}

function isBetter(candidate: Candidate, current: Candidate): boolean {
  const candidateScoreValue = candidateScore(candidate)
  const currentScoreValue = candidateScore(current)
  for (let index = 0; index < candidateScoreValue.length; index++) {
    if (candidateScoreValue[index] < currentScoreValue[index] - EPSILON) return true
    if (candidateScoreValue[index] > currentScoreValue[index] + EPSILON) return false
  }
  return false
}

/**
 * Packs the same queue through several independent MaxRects strategies, then
 * chooses the one that uses the least total film length.  This gives a much
 * better result for five or more mixed-size arts than relying on upload order.
 */
export function packImages(images: GangImage[], maxHeightCm: number, canvasWidthCm: number, itemGapCm: number): PackingResult {
  const units = expandQueue(images).filter((unit) => unit.widthCm > 0 && unit.heightCm > 0)
  if (units.length === 0) return { pages: [], unplaced: [], strategy: 'vazio' }

  // Mixed artwork needs more than one greedy order. Small/medium jobs get a
  // broader deterministic search; very large queues keep a compact strategy
  // set so the browser remains responsive.
  const strategies: Array<[SortStrategy, FitStrategy]> =
    units.length <= 80
      ? (['area', 'max-side', 'min-side', 'height', 'width', 'perimeter', 'aspect'] as SortStrategy[]).flatMap(
          (sort) =>
            (['film-height', 'bottom-left', 'short-side', 'area'] as FitStrategy[]).map(
              (fit): [SortStrategy, FitStrategy] => [sort, fit]
            )
        )
      : units.length <= 350
        ? [
            ['area', 'film-height'],
            ['max-side', 'film-height'],
            ['height', 'film-height'],
            ['width', 'film-height'],
            ['area', 'bottom-left'],
            ['max-side', 'bottom-left'],
            ['area', 'short-side'],
            ['max-side', 'area'],
            ['perimeter', 'long-side'],
          ]
        : [
            ['area', 'film-height'],
            ['max-side', 'film-height'],
            ['area', 'bottom-left'],
            ['max-side', 'short-side'],
          ]

  let best = packWithStrategy(units, maxHeightCm, canvasWidthCm, itemGapCm, strategies[0][0], strategies[0][1])
  for (const [sortStrategy, fitStrategy] of strategies.slice(1)) {
    const candidate = packWithStrategy(units, maxHeightCm, canvasWidthCm, itemGapCm, sortStrategy, fitStrategy)
    if (isBetter(candidate, best)) best = candidate
  }

  return { pages: best.pages, unplaced: best.unplaced, strategy: best.name }
}
