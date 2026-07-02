import { CANVAS_WIDTH_CM, ITEM_GAP_CM } from './constants'
import type { GangImage, PackedPage, PlacedItem } from '@/types'

interface PackableUnit {
  id: string
  sourceImageId: string
  previewUrl: string
  widthCm: number
  heightCm: number
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
      })
    }
  }
  return units
}

/**
 * Shelf-based bin packing (First-Fit Decreasing Height):
 * - Items are sorted tallest-first.
 * - Each "shelf" is a horizontal row; items are placed left-to-right until
 *   the fixed canvas width is exhausted, then a new shelf starts below.
 * - If a new shelf would exceed the user-defined max page height, a new
 *   page is started instead (auto-pagination).
 */
export function packImages(images: GangImage[], maxHeightCm: number): PackedPage[] {
  const units = expandQueue(images).sort((a, b) => b.heightCm - a.heightCm)

  const pages: PackedPage[] = []

  let currentPage: PackedPage = { index: 0, items: [], usedHeightCm: 0 }
  let shelfY = 0
  let shelfHeight = 0
  let cursorX = 0

  const pushPage = () => {
    currentPage.usedHeightCm = shelfY + shelfHeight
    pages.push(currentPage)
    currentPage = { index: pages.length, items: [], usedHeightCm: 0 }
    shelfY = 0
    shelfHeight = 0
    cursorX = 0
  }

  for (const unit of units) {
    // Item wider than the whole sheet: clamp so it's still visible (edge case guard).
    const itemWidth = Math.min(unit.widthCm, CANVAS_WIDTH_CM)

    // Doesn't fit in the remaining width of the current shelf -> new shelf.
    if (cursorX > 0 && cursorX + itemWidth > CANVAS_WIDTH_CM) {
      const nextShelfY = shelfY + shelfHeight + ITEM_GAP_CM
      if (nextShelfY + unit.heightCm > maxHeightCm) {
        pushPage()
      } else {
        shelfY = nextShelfY
        shelfHeight = 0
        cursorX = 0
      }
    }

    // Even an empty shelf can't fit this item's height on the current page -> new page.
    if (shelfY + unit.heightCm > maxHeightCm) {
      pushPage()
    }

    const placed: PlacedItem = {
      id: unit.id,
      sourceImageId: unit.sourceImageId,
      previewUrl: unit.previewUrl,
      xCm: cursorX,
      yCm: shelfY,
      widthCm: itemWidth,
      heightCm: unit.heightCm,
      angle: 0,
    }
    currentPage.items.push(placed)

    cursorX += itemWidth + ITEM_GAP_CM
    shelfHeight = Math.max(shelfHeight, unit.heightCm)
  }

  if (currentPage.items.length > 0 || pages.length === 0) {
    currentPage.usedHeightCm = shelfY + shelfHeight
    pages.push(currentPage)
  }

  return pages
}
