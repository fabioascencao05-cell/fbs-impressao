import type { GangImage, PackedPage, PackingMask, PlacedItem } from '@/types'

export interface RasterPackingMask {
  width: number
  height: number
  data: Uint8Array
  occupied: ReadonlyArray<readonly [number, number]>
}

interface ExpandedMask {
  raw: RasterPackingMask
  padding: number
  occupied: ReadonlyArray<readonly [number, number]>
}

interface ShapeUnit {
  image: GangImage
  id: string
  mask0: RasterPackingMask
  mask90: RasterPackingMask
}

interface ShapePage {
  items: PlacedItem[]
  occupancy: Uint8Array
  occupiedCount: number
}

interface Candidate {
  page: ShapePage
  x: number
  y: number
  angle: 0 | 90
  mask: RasterPackingMask
  expanded: ExpandedMask
  boxWidthCm: number
  boxHeightCm: number
}

const MIN_CELL_CM = 0.2
const MAX_PAGE_CELLS = 160_000
const MAX_UNITS = 250
const MAX_CANDIDATE_CHECKS = 3_000_000

function occupiedCoordinates(data: Uint8Array, width: number): Array<readonly [number, number]> {
  const result: Array<readonly [number, number]> = []
  for (let index = 0; index < data.length; index++) {
    if (data[index]) result.push([index % width, Math.floor(index / width)] as const)
  }
  return result
}

/** Conservatively resamples a source ink mask to the physical packing grid. */
export function rasterizePackingMask(mask: PackingMask | undefined, width: number, height: number): RasterPackingMask {
  const targetWidth = Math.max(1, Math.ceil(width))
  const targetHeight = Math.max(1, Math.ceil(height))
  const data = new Uint8Array(targetWidth * targetHeight)
  const validMask =
    mask &&
    mask.widthPx > 0 &&
    mask.heightPx > 0 &&
    mask.data.length >= mask.widthPx * mask.heightPx

  if (!validMask) {
    data.fill(1)
    return { width: targetWidth, height: targetHeight, data, occupied: occupiedCoordinates(data, targetWidth) }
  }

  for (let y = 0; y < targetHeight; y++) {
    const sourceY0 = Math.floor((y * mask.heightPx) / targetHeight)
    const sourceY1 = Math.max(sourceY0 + 1, Math.ceil(((y + 1) * mask.heightPx) / targetHeight))
    for (let x = 0; x < targetWidth; x++) {
      const sourceX0 = Math.floor((x * mask.widthPx) / targetWidth)
      const sourceX1 = Math.max(sourceX0 + 1, Math.ceil(((x + 1) * mask.widthPx) / targetWidth))
      let hasInk = false
      for (let sourceY = sourceY0; sourceY < sourceY1 && !hasInk; sourceY++) {
        for (let sourceX = sourceX0; sourceX < sourceX1; sourceX++) {
          if (mask.data[sourceY * mask.widthPx + sourceX]) {
            hasInk = true
            break
          }
        }
      }
      if (hasInk) data[y * targetWidth + x] = 1
    }
  }

  // Blank/invalid artwork stays conservative instead of becoming a free item.
  let occupied = occupiedCoordinates(data, targetWidth)
  if (occupied.length === 0) {
    data.fill(1)
    occupied = occupiedCoordinates(data, targetWidth)
  }
  return { width: targetWidth, height: targetHeight, data, occupied }
}

/** Rotates the bitmap clockwise, matching Fabric's positive 90 degree angle. */
export function rotatePackingMask90(mask: RasterPackingMask): RasterPackingMask {
  const width = mask.height
  const height = mask.width
  const data = new Uint8Array(width * height)
  for (const [x, y] of mask.occupied) {
    const rotatedX = mask.height - 1 - y
    const rotatedY = x
    data[rotatedY * width + rotatedX] = 1
  }
  return { width, height, data, occupied: occupiedCoordinates(data, width) }
}

function expandMask(mask: RasterPackingMask, padding: number): ExpandedMask {
  if (padding <= 0) return { raw: mask, padding: 0, occupied: mask.occupied }
  const width = mask.width + padding * 2
  const height = mask.height + padding * 2
  const data = new Uint8Array(width * height)
  for (const [x, y] of mask.occupied) {
    for (let dy = -padding; dy <= padding; dy++) {
      for (let dx = -padding; dx <= padding; dx++) {
        data[(y + dy + padding) * width + x + dx + padding] = 1
      }
    }
  }
  return { raw: mask, padding, occupied: occupiedCoordinates(data, width) }
}

/** Public collision primitive for focused tests and future worker extraction. */
export function canPlacePackingMask(
  occupancy: Uint8Array,
  pageWidth: number,
  pageHeight: number,
  mask: RasterPackingMask,
  x: number,
  y: number,
  gapCells = 0
): boolean {
  if (x < 0 || y < 0 || x + mask.width > pageWidth || y + mask.height > pageHeight) return false
  const expanded = expandMask(mask, Math.max(0, Math.ceil(gapCells)))
  for (const [expandedX, expandedY] of expanded.occupied) {
    const pageX = x + expandedX - expanded.padding
    const pageY = y + expandedY - expanded.padding
    // Gap is required between ink shapes, not between ink and sheet edges.
    if (pageX < 0 || pageY < 0 || pageX >= pageWidth || pageY >= pageHeight) continue
    if (occupancy[pageY * pageWidth + pageX]) return false
  }
  return true
}

function stampMask(page: ShapePage, pageWidth: number, mask: RasterPackingMask, x: number, y: number) {
  for (const [maskX, maskY] of mask.occupied) {
    const index = (y + maskY) * pageWidth + x + maskX
    if (!page.occupancy[index]) {
      page.occupancy[index] = 1
      page.occupiedCount++
    }
  }
}

function toPlacedItem(unit: ShapeUnit, candidate: Candidate, cellCm: number): PlacedItem {
  const image = unit.image
  return {
    id: unit.id,
    sourceImageId: image.id,
    previewUrl: image.previewUrl,
    xCm: candidate.x * cellCm,
    yCm: candidate.y * cellCm,
    widthCm: image.widthCm,
    heightCm: image.heightCm,
    angle: candidate.angle,
    contentXPx: image.contentXPx,
    contentYPx: image.contentYPx,
    contentWidthPx: image.contentWidthPx,
    contentHeightPx: image.contentHeightPx,
    naturalWidthPx: image.naturalWidthPx,
    naturalHeightPx: image.naturalHeightPx,
  }
}

/**
 * Shape-aware bottom-left packing. Returns null when safety/complexity limits
 * are reached, allowing the caller to fall back to rectangle MaxRects.
 */
export function packImagesByShape(
  images: GangImage[],
  maxHeightCm: number,
  canvasWidthCm: number,
  itemGapCm: number
): PackedPage[] | null {
  const unitCount = images.reduce((sum, image) => sum + image.quantity, 0)
  if (unitCount === 0) return [{ index: 0, items: [], usedHeightCm: 0 }]
  if (unitCount > MAX_UNITS) return null

  const cellCm = Math.max(MIN_CELL_CM, Math.sqrt((canvasWidthCm * maxHeightCm) / MAX_PAGE_CELLS))
  const pageWidth = Math.max(1, Math.ceil(canvasWidthCm / cellCm))
  const pageHeight = Math.max(1, Math.ceil(maxHeightCm / cellCm))
  const gapCells = Math.ceil(itemGapCm / cellCm)
  const units: ShapeUnit[] = []

  for (const image of images) {
    const mask0 = rasterizePackingMask(image.packingMask, image.widthCm / cellCm, image.heightCm / cellCm)
    const mask90 = rotatePackingMask90(mask0)
    for (let copy = 0; copy < image.quantity; copy++) {
      units.push({ image, id: `${image.id}-${copy}`, mask0, mask90 })
    }
  }
  units.sort((a, b) => b.image.widthCm * b.image.heightCm - a.image.widthCm * a.image.heightCm)

  const pages: ShapePage[] = []
  let candidateChecks = 0

  const findOnPage = (page: ShapePage, unit: ShapeUnit, angle: 0 | 90): Candidate | null => {
    const mask = angle === 0 ? unit.mask0 : unit.mask90
    const boxWidthCm = angle === 0 ? unit.image.widthCm : unit.image.heightCm
    const boxHeightCm = angle === 0 ? unit.image.heightCm : unit.image.widthCm
    const maxX = Math.min(pageWidth - mask.width, Math.floor((canvasWidthCm - boxWidthCm) / cellCm + 1e-9))
    const maxY = Math.min(pageHeight - mask.height, Math.floor((maxHeightCm - boxHeightCm) / cellCm + 1e-9))
    if (maxX < 0 || maxY < 0) return null
    const expanded = expandMask(mask, gapCells)

    for (let y = 0; y <= maxY; y++) {
      for (let x = 0; x <= maxX; x++) {
        candidateChecks++
        if (candidateChecks > MAX_CANDIDATE_CHECKS) return null
        if (page.occupiedCount === 0 || canPlaceExpanded(page.occupancy, pageWidth, pageHeight, expanded, x, y)) {
          return { page, x, y, angle, mask, expanded, boxWidthCm, boxHeightCm }
        }
      }
    }
    return null
  }

  for (const unit of units) {
    let best: Candidate | null = null
    for (const page of pages) {
      for (const angle of [0, 90] as const) {
        const candidate = findOnPage(page, unit, angle)
        if (!candidate) continue
        const bottomCm = candidate.y * cellCm + candidate.boxHeightCm
        const bestBottomCm = best ? best.y * cellCm + best.boxHeightCm : Infinity
        if (bottomCm < bestBottomCm || (bottomCm === bestBottomCm && candidate.x < (best?.x ?? Infinity))) best = candidate
      }
    }

    if (!best) {
      if (candidateChecks > MAX_CANDIDATE_CHECKS) return null
      const page: ShapePage = { items: [], occupancy: new Uint8Array(pageWidth * pageHeight), occupiedCount: 0 }
      pages.push(page)
      const candidates = ([0, 90] as const)
        .map((angle) => findOnPage(page, unit, angle))
        .filter((candidate): candidate is Candidate => candidate !== null)
      best = candidates.sort((a, b) => a.boxHeightCm - b.boxHeightCm || a.boxWidthCm - b.boxWidthCm)[0] ?? null
    }

    // Input validation guarantees a new page can hold the unit. Returning null
    // here invokes the safe rectangle fallback instead of emitting bad coords.
    if (!best) return null
    stampMask(best.page, pageWidth, best.mask, best.x, best.y)
    best.page.items.push(toPlacedItem(unit, best, cellCm))
  }

  return pages.map((page, index) => ({
    index,
    items: page.items,
    usedHeightCm: page.items.reduce((height, item) => {
      const boxHeight = item.angle === 90 ? item.widthCm : item.heightCm
      return Math.max(height, item.yCm + boxHeight)
    }, 0),
  }))
}

function canPlaceExpanded(
  occupancy: Uint8Array,
  pageWidth: number,
  pageHeight: number,
  mask: ExpandedMask,
  x: number,
  y: number
): boolean {
  for (const [expandedX, expandedY] of mask.occupied) {
    const pageX = x + expandedX - mask.padding
    const pageY = y + expandedY - mask.padding
    if (pageX < 0 || pageY < 0 || pageX >= pageWidth || pageY >= pageHeight) continue
    if (occupancy[pageY * pageWidth + pageX]) return false
  }
  return true
}
