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
