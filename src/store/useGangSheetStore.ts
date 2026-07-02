import { create } from 'zustand'
import { packImages } from '@/lib/binPacking'
import { DEFAULT_MAX_HEIGHT_CM, ZOOM_MAX, ZOOM_MIN } from '@/lib/constants'
import type { GangImage, PackedPage, PlacedItem } from '@/types'

interface GangSheetState {
  images: GangImage[]
  maxHeightCm: number
  pages: PackedPage[]
  zoom: number

  addImages: (files: File[]) => Promise<{ added: number; skipped: number }>
  removeImage: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  updateWidthCm: (id: string, widthCm: number) => void
  setMaxHeightCm: (heightCm: number) => void
  generateLayout: () => void
  updatePlacedItem: (pageIndex: number, itemId: string, patch: Partial<PlacedItem>) => void
  removePlacedItem: (pageIndex: number, itemId: string) => void
  setZoom: (zoom: number) => void
  reset: () => void
}

function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

const DEFAULT_WIDTH_CM = 10

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

export const useGangSheetStore = create<GangSheetState>((set, get) => ({
  images: [],
  maxHeightCm: DEFAULT_MAX_HEIGHT_CM,
  pages: [],
  zoom: 1,

  addImages: async (files) => {
    const pngFiles = files.filter((f) => f.type === 'image/png')
    const skipped = files.length - pngFiles.length
    const newImages: GangImage[] = []

    for (const file of pngFiles) {
      const { width, height } = await loadImageDimensions(file)
      const aspectRatio = height / width
      newImages.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        naturalWidthPx: width,
        naturalHeightPx: height,
        aspectRatio,
        quantity: 1,
        widthCm: DEFAULT_WIDTH_CM,
        heightCm: DEFAULT_WIDTH_CM * aspectRatio,
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

  generateLayout: () => {
    const { images, maxHeightCm } = get()
    const pages = packImages(images, maxHeightCm)
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

  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),

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
