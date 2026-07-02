export interface GangImage {
  id: string
  file: File
  previewUrl: string
  naturalWidthPx: number
  naturalHeightPx: number
  aspectRatio: number // height / width
  quantity: number
  widthCm: number
  heightCm: number
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
}

export interface PackedPage {
  index: number
  items: PlacedItem[]
  usedHeightCm: number
}
