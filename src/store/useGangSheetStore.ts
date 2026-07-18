import { create } from 'zustand'
import { packImages } from '@/lib/binPacking'
import { computeContentBox } from '@/lib/trimImage'
import { releaseImageElement } from '@/lib/imageCache'
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
  costPerCm2: number

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
  duplicatePlacedItem: (pageIndex: number, itemId: string) => void
  removePage: (pageIndex: number) => void
  setZoom: (zoom: number) => void
  setSheetBackgroundColor: (color: string) => void
  setCostPerCm2: (cost: number) => void
  reset: () => void
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
  costPerCm2: 0,

  addImages: async (files) => {
    const accepted = files.filter((f) => ACCEPTED_TYPES.has(f.type))
    const skipped = files.length - accepted.length

    // Decode/scan every file in parallel — sequential awaits made large batches
    // needlessly slow. Order is preserved by Promise.all.
    const newImages = await Promise.all(
      accepted.map(async (file): Promise<GangImage> => {
        const box = await computeContentBox(file)
        const aspectRatio = box.heightPx / box.widthPx
        // Real-world size at print resolution — never altered/clamped, so the
        // uploaded artwork keeps its exact measure regardless of sheet size.
        // Rounded to 1 decimal so the sidebar input shows a clean value.
        const widthCm = Math.max(0.1, Math.round((box.widthPx / EXPORT_PX_PER_CM) * 10) / 10)
        const heightCm = widthCm * aspectRatio
        return {
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
        }
      })
    )

    set((state) => ({ images: [...state.images, ...newImages] }))
    return { added: accepted.length, skipped }
  },

  removeImage: (id) => {
    set((state) => {
      const target = state.images.find((img) => img.id === id)
      if (target) {
        releaseImageElement(target.previewUrl)
        URL.revokeObjectURL(target.previewUrl)
      }
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

  duplicatePlacedItem: (pageIndex, itemId) => {
    set((state) => ({
      pages: state.pages.map((page) => {
        if (page.index !== pageIndex) return page
        const source = page.items.find((it) => it.id === itemId)
        if (!source) return page
        const clone: PlacedItem = {
          ...source,
          // Unique even when duplicating twice within the same millisecond;
          // Date.now()-based ids could collide and break React keys / selection.
          id: `${source.sourceImageId}-dup-${crypto.randomUUID()}`,
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

  setCostPerCm2: (cost) => set({ costPerCm2: Math.max(0, cost) }),

  reset: () => {
    set((state) => {
      state.images.forEach((img) => {
        releaseImageElement(img.previewUrl)
        URL.revokeObjectURL(img.previewUrl)
      })
      return { images: [], pages: [] }
    })
  },
}))

// Dev-only handle for automated end-to-end testing of layout/export.
if (import.meta.env.DEV) {
  ;(window as unknown as { __gangStore?: typeof useGangSheetStore }).__gangStore =
    useGangSheetStore
}
