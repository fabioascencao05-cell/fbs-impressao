import { create } from 'zustand'
import { packImages } from '@/lib/binPacking'
import { computeContentBox } from '@/lib/trimImage'
import {
  DEFAULT_CANVAS_WIDTH_CM,
  DEFAULT_ITEM_GAP_CM,
  DEFAULT_MAX_HEIGHT_CM,
  EXPORT_PX_PER_CM,
  ZOOM_MAX,
  ZOOM_MIN,
} from '@/lib/constants'
import type { GangImage, PackedPage, PlacedItem } from '@/types'

interface GangSheetState {
  images: GangImage[]
  maxHeightCm: number
  canvasWidthCm: number
  itemGapCm: number
  pages: PackedPage[]
  zoom: number
  sheetBackgroundColor: string

  addImages: (files: File[]) => Promise<{ added: number; skipped: number }>
  removeImage: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  updateWidthCm: (id: string, widthCm: number) => void
  setMaxHeightCm: (heightCm: number) => void
  setCanvasWidthCm: (widthCm: number) => void
  setItemGapCm: (gapCm: number) => void
  generateLayout: () => void
  updatePlacedItem: (pageIndex: number, itemId: string, patch: Partial<PlacedItem>) => void
  removePlacedItem: (pageIndex: number, itemId: string) => void
  removePage: (pageIndex: number) => void
  setZoom: (zoom: number) => void
  setSheetBackgroundColor: (color: string) => void
  reset: () => void
}

function clampToSheet(widthCm: number, heightCm: number, maxW: number, maxH: number) {
  if (widthCm > maxW) {
    const ratio = maxW / widthCm
    widthCm = maxW
    heightCm *= ratio
  }
  if (heightCm > maxH) {
    const ratio = maxH / heightCm
    heightCm = maxH
    widthCm *= ratio
  }
  return { widthCm, heightCm }
}

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

export const useGangSheetStore = create<GangSheetState>((set, get) => ({
  images: [],
  maxHeightCm: DEFAULT_MAX_HEIGHT_CM,
  canvasWidthCm: DEFAULT_CANVAS_WIDTH_CM,
  itemGapCm: DEFAULT_ITEM_GAP_CM,
  pages: [],
  zoom: 1,
  sheetBackgroundColor: '#ffffff',

  addImages: async (files) => {
    const pngFiles = files.filter((f) => f.type === 'image/png')
    const skipped = files.length - pngFiles.length
    const newImages: GangImage[] = []

    const { canvasWidthCm, maxHeightCm, itemGapCm } = get()
    const maxW = Math.max(0.01, canvasWidthCm - itemGapCm)
    const maxH = Math.max(0.01, maxHeightCm - itemGapCm)

    for (const file of pngFiles) {
      const box = await computeContentBox(file)
      const aspectRatio = box.heightPx / box.widthPx
      let widthCm = box.widthPx / EXPORT_PX_PER_CM
      let heightCm = widthCm * aspectRatio
      ;({ widthCm, heightCm } = clampToSheet(widthCm, heightCm, maxW, maxH))
      newImages.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        naturalWidthPx: box.naturalWidthPx,
        naturalHeightPx: box.naturalHeightPx,
        aspectRatio,
        quantity: 1,
        widthCm,
        heightCm,
        contentXPx: box.xPx,
        contentYPx: box.yPx,
        contentWidthPx: box.widthPx,
        contentHeightPx: box.heightPx,
      })
    }

    set((state) => ({ images: [...state.images, ...newImages] }))
    return { added: newImages.length, skipped }
  },

  removeImage: (id) => {
    set((state) => {
      const target = state.images.find((img) => img.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return {
        images: state.images.filter((img) => img.id !== id),
        // Drop any placed instances of the removed source image from the layout.
        pages: state.pages.map((page) => ({
          ...page,
          items: page.items.filter((it) => it.sourceImageId !== id),
        })),
      }
    })
  },

  updateQuantity: (id, quantity) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, quantity: Math.max(1, Math.floor(quantity) || 1) } : img
      ),
    }))
  },

  updateWidthCm: (id, widthCm) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id && widthCm > 0
          ? { ...img, widthCm, heightCm: widthCm * img.aspectRatio }
          : img
      ),
    }))
  },

  setMaxHeightCm: (heightCm) => {
    set({ maxHeightCm: Math.max(1, heightCm) })
  },

  setCanvasWidthCm: (widthCm) => {
    set({ canvasWidthCm: Math.max(1, widthCm) })
  },

  setItemGapCm: (gapCm) => {
    set({ itemGapCm: Math.max(0, gapCm) })
  },

  generateLayout: () => {
    const { images, maxHeightCm, canvasWidthCm, itemGapCm } = get()
    const pages = packImages(images, maxHeightCm, canvasWidthCm, itemGapCm)
    set({ pages })
  },

  updatePlacedItem: (pageIndex, itemId, patch) => {
    set((state) => ({
      pages: state.pages.map((page) => {
        if (page.index !== pageIndex) return page
        const items = page.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it))
        const usedHeightCm = items.reduce((max, it) => Math.max(max, it.yCm + it.heightCm), 0)
        return { ...page, items, usedHeightCm }
      }),
    }))
  },

  removePlacedItem: (pageIndex, itemId) => {
    set((state) => ({
      pages: state.pages.map((page) => {
        if (page.index !== pageIndex) return page
        const items = page.items.filter((it) => it.id !== itemId)
        const usedHeightCm = items.reduce((max, it) => Math.max(max, it.yCm + it.heightCm), 0)
        return { ...page, items, usedHeightCm }
      }),
    }))
  },

  removePage: (pageIndex) => {
    set((state) => ({
      pages: state.pages
        .filter((page) => page.index !== pageIndex)
        .map((page, index) => ({ ...page, index })),
    }))
  },

  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),

  setSheetBackgroundColor: (color) => set({ sheetBackgroundColor: color }),

  reset: () => {
    set((state) => {
      state.images.forEach((img) => URL.revokeObjectURL(img.previewUrl))
      return { images: [], pages: [] }
    })
  },
}))

// Dev-only handle for automated end-to-end testing of layout/export.
if (import.meta.env.DEV) {
  ;(window as unknown as { __gangStore?: typeof useGangSheetStore }).__gangStore =
    useGangSheetStore
}
