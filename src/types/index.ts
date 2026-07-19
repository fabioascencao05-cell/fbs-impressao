/**
 * Low-resolution occupancy mask of the real artwork shape, normalized over the
 * content bounding box. `data` is row-major (`data[r * cols + c]`), 1 = the cell
 * holds visible pixels, 0 = transparent/empty. The shape packer resamples this
 * to the sheet grid so arts can nest inside each other's empty space.
 */
export interface ArtMask {
  cols: number
  rows: number
  data: Uint8Array
  // False when the file has no usable alpha channel (e.g. JPEG); in that case the
  // mask is a full rectangle so we never nest into a fake "white = empty" region.
  hasAlpha: boolean
}

export interface GangImage {
  id: string
  file: File
  previewUrl: string
  naturalWidthPx: number
  naturalHeightPx: number
  aspectRatio: number // trimmed content height / width
  quantity: number
  widthCm: number
  heightCm: number
  // Tight bounding box of non-transparent pixels, in the original file's px space.
  contentXPx: number
  contentYPx: number
  contentWidthPx: number
  contentHeightPx: number
  // Real-shape occupancy mask over the content box (undefined => rectangle fallback).
  mask?: ArtMask
}

export interface PlacedItem {
  id: string
  sourceImageId: string
  previewUrl: string
  xCm: number
  yCm: number
  widthCm: number
  heightCm: number
  angle: number // rotation in degrees, around the top-left origin
  // Same content bounding box + full file dimensions, carried over from the
  // source GangImage so the renderer/exporter can place the whole (padded)
  // image behind the packed content rectangle.
  contentXPx: number
  contentYPx: number
  contentWidthPx: number
  contentHeightPx: number
  naturalWidthPx: number
  naturalHeightPx: number
}

export interface PackedPage {
  index: number
  items: PlacedItem[]
  usedHeightCm: number
}

/** An art that does not fit the sheet at its user-defined size (never resized). */
export interface UnfitArt {
  sourceImageId: string
  label: string
  widthCm: number
  heightCm: number
}

export interface PackResult {
  pages: PackedPage[]
  unfit: UnfitArt[]
}
