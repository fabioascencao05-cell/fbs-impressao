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

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

interface GangSheetState {
  images: GangImage[]
  maxHeightCm: number
  canvasWidthCm: number
  itemGapCm: number
  pages: PackedPage[]
  zoom: number
  sheetBackgroundColor: string
  pricePerMeter: number
  allowRotation: boolean

  addImages: (files: File[]) => Promise<{ added: number; skipped: number }>
  removeImage: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  updateWidthCm: (id: string, widthCm: number) => void
  updateHeightCm: (id: string, heightCm: number) => void
  setMaxHeightCm: (heightCm: number) => void
  setCanvasWidthCm: (widthCm: number) => void
  setItemGapCm: (gapCm: number) => void
  generateLayout: () => void
  updatePlacedItem: (pageIndex: number, itemId: string, patch: Partial<PlacedItem>) => void
  removePlacedItem: (pageIndex: number, itemId: string) => void
  duplicatePlacedItem: (pageIndex: number, itemId: string) => void
  removePage: (pageIndex: number) => void
  setZoom: (zoom: number) => void
  setSheetBackgroundColor: (color: string) => void
  setPricePerMeter: (price: number) => void
  setAllowRotation: (allow: boolean) => void
  reset: () => void
}

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

// All physical measures are kept to 0.1cm so the UI never shows raw
// floating-point tails like 4.788135593220339.
function roundCm(v: number) {
  return Math.round(v * 10) / 10
}

export const useGangSheetStore = create<GangSheetState>((set, get) => ({
  images: [],
  maxHeightCm: DEFAULT_MAX_HEIGHT_CM,
  canvasWidthCm: DEFAULT_CANVAS_WIDTH_CM,
  itemGapCm: DEFAULT_ITEM_GAP_CM,
  pages: [],
  zoom: 1,
  sheetBackgroundColor: '#ffffff',
  pricePerMeter: 0,
  allowRotation: true,

  addImages: async (files) => {
    const accepted = files.filter((f) => ACCEPTED_TYPES.has(f.type))
    const skipped = files.length - accepted.length
    const newImages: GangImage[] = []

    for (const file of accepted) {
      const box = await computeContentBox(file)
      const aspectRatio = box.heightPx / box.widthPx
      // Real-world size at print resolution — never altered/clamped, so the
      // uploaded artwork keeps its exact measure regardless of sheet size.
      const widthCm = roundCm(box.widthPx / EXPORT_PX_PER_CM)
      const heightCm = roundCm(widthCm * aspectRatio)
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
    return { added: accepted.length, skipped }
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
          ? { ...img, widthCm: roundCm(widthCm), heightCm: roundCm(widthCm * img.aspectRatio) }
          : img
      ),
    }))
  },

  updateHeightCm: (id, heightCm) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id && heightCm > 0
          ? { ...img, heightCm: roundCm(heightCm), widthCm: roundCm(heightCm / img.aspectRatio) }
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
    const { images, maxHeightCm, canvasWidthCm, itemGapCm, allowRotation } = get()
    const pages = packImages(images, maxHeightCm, canvasWidthCm, itemGapCm, allowRotation)
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

  duplicatePlacedItem: (pageIndex, itemId) => {
    set((state) => ({
      pages: state.pages.map((page) => {
        if (page.index !== pageIndex) return page
        const source = page.items.find((it) => it.id === itemId)
        if (!source) return page
        const clone: PlacedItem = {
          ...source,
          id: `${source.sourceImageId}-dup-${Date.now()}`,
          xCm: source.xCm + 1,
          yCm: source.yCm + 1,
        }
        const items = [...page.items, clone]
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

  setPricePerMeter: (price) => set({ pricePerMeter: Math.max(0, price) }),

  setAllowRotation: (allow) => set({ allowRotation: allow }),

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
