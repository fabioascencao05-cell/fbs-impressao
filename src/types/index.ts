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
}

export interface PlacedItem {
  id: string
  sourceImageId: string
  previewUrl: string
  // Top-left of the item's axis-aligned bounding box on the sheet, in cm.
  xCm: number
  yCm: number
  // The art's real, unrotated content size in cm — never swapped by rotation,
  // so it always reflects the true printed measure. The on-sheet footprint is
  // derived from these plus `angle` (see rotatedAabbCm).
  widthCm: number
  heightCm: number
  angle: number // rotation in degrees (0 or 90 from the packer; any value if the user rotates by hand)
  // Content bounding box (tight non-transparent rect) + full file dimensions,
  // carried over from the source GangImage so the renderer/exporter can crop the
  // image to just the visible art before scaling/rotating it into place.
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
