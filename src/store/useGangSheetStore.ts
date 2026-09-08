import { create } from 'zustand'
import { proportionatePatch } from '@/lib/exportPlan'
import { packImages } from '@/lib/binPacking'
import { rotatedAabbCm } from '@/lib/geometry'
import { computeContentBox } from '@/lib/trimImage'
import { defaultPrintWidthCm } from '@/lib/printQuality'
import {
  DEFAULT_CANVAS_WIDTH_CM,
  DEFAULT_ITEM_GAP_CM,
  DEFAULT_MAX_HEIGHT_CM,
  ZOOM_MAX,
  ZOOM_MIN,
} from '@/lib/constants'
import type { GangImage, PackedPage, PlacedItem } from '@/types'

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])

interface GangSheetState {
  images: GangImage[]
  maxHeightCm: number
  canvasWidthCm: number
  itemGapCm: number
  pages: PackedPage[]
  unplacedImages: Array<{ sourceImageId: string; widthCm: number; heightCm: number }>
  packingStrategy: string | null
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

function finiteAtLeast(value: number, minimum: number, fallback: number) {
  return Number.isFinite(value) && value >= minimum ? value : fallback
}

// Bottom edge of an item on the sheet, honouring rotation: a 90°-rotated item's
// on-sheet height is its (unrotated) width, so we take the AABB height.
function itemBottomCm(it: PlacedItem) {
  return it.yCm + rotatedAabbCm(it.widthCm, it.heightCm, it.angle).hCm
}

function computeUsedHeightCm(items: PlacedItem[]) {
  return items.reduce((max, it) => Math.max(max, itemBottomCm(it)), 0)
}

const clearedLayout = () => ({
  pages: [] as PackedPage[],
  unplacedImages: [] as GangSheetState['unplacedImages'],
  packingStrategy: null,
})

export const useGangSheetStore = create<GangSheetState>((set, get) => ({
  images: [],
  maxHeightCm: DEFAULT_MAX_HEIGHT_CM,
  canvasWidthCm: DEFAULT_CANVAS_WIDTH_CM,
  itemGapCm: DEFAULT_ITEM_GAP_CM,
  pages: [],
  unplacedImages: [],
  packingStrategy: null,
  zoom: 1,
  sheetBackgroundColor: '#ffffff',
  costPerCm2: 0,

  addImages: async (files) => {
    const accepted = files.filter((f) => ACCEPTED_TYPES.has(f.type))
    let skipped = files.length - accepted.length
    const newImages: GangImage[] = []

    // Decode a few files at a time. This handles a large drag-and-drop batch
    // quickly without exhausting the browser with hundreds of canvases at once.
    for (let start = 0; start < accepted.length; start += 4) {
      const batch = await Promise.all(
        accepted.slice(start, start + 4).map(async (file): Promise<GangImage | null> => {
          try {
            const box = await computeContentBox(file)
            const aspectRatio = box.heightPx / box.widthPx
            const widthCm = defaultPrintWidthCm(box.widthPx)
            const image: GangImage = {
              id: crypto.randomUUID(),
              file,
              previewUrl: URL.createObjectURL(file),
              naturalWidthPx: box.naturalWidthPx,
              naturalHeightPx: box.naturalHeightPx,
              aspectRatio,
              quantity: 1,
              widthCm,
              heightCm: widthCm * aspectRatio,
              contentXPx: box.xPx,
              contentYPx: box.yPx,
              contentWidthPx: box.widthPx,
              contentHeightPx: box.heightPx,
            }
            return image
          } catch {
            skipped++
            return null
          }
        })
      )
      newImages.push(...batch.filter((image): image is GangImage => image !== null))
    }

    set((state) => ({ images: [...state.images, ...newImages], ...clearedLayout() }))
    return { added: newImages.length, skipped }
  },

  removeImage: (id) => {
    set((state) => {
      const target = state.images.find((img) => img.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      const pages = state.pages
        .map((page) => {
          const items = page.items.filter((it) => it.sourceImageId !== id)
          return { ...page, items, usedHeightCm: computeUsedHeightCm(items) }
        })
        .filter((page) => page.items.length > 0)
        .map((page, index) => ({ ...page, index }))
      return {
        images: state.images.filter((img) => img.id !== id),
        pages,
        unplacedImages: state.unplacedImages.filter((it) => it.sourceImageId !== id),
        packingStrategy: null,
      }
    })
  },

  updateQuantity: (id, quantity) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, quantity: Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : img.quantity } : img
      ),
      ...clearedLayout(),
    }))
  },

  updateWidthCm: (id, widthCm) => {
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id && Number.isFinite(widthCm) && widthCm > 0
          ? { ...img, widthCm, heightCm: widthCm * img.aspectRatio }
          : img
      ),
      ...clearedLayout(),
    }))
  },

  setMaxHeightCm: (heightCm) => {
    set((state) => ({ maxHeightCm: finiteAtLeast(heightCm, 1, state.maxHeightCm), ...clearedLayout() }))
  },

  setCanvasWidthCm: (widthCm) => {
    set((state) => ({ canvasWidthCm: finiteAtLeast(widthCm, 1, state.canvasWidthCm), ...clearedLayout() }))
  },

  setItemGapCm: (gapCm) => {
    set((state) => ({ itemGapCm: finiteAtLeast(gapCm, 0, state.itemGapCm), ...clearedLayout() }))
  },

  generateLayout: () => {
    const { images, maxHeightCm, canvasWidthCm, itemGapCm } = get()
    const result = packImages(images, maxHeightCm, canvasWidthCm, itemGapCm)
    set({ pages: result.pages, unplacedImages: result.unplaced, packingStrategy: result.strategy })
  },

  updatePlacedItem: (pageIndex, itemId, patch) => {
    set((state) => ({
      pages: state.pages.map((page) => {
        if (page.index !== pageIndex) return page
        const items = page.items.map((it) => (it.id === itemId ? proportionatePatch(it, patch) : it))
        const usedHeightCm = computeUsedHeightCm(items)
        return { ...page, items, usedHeightCm }
      }),
    }))
  },

  removePlacedItem: (pageIndex, itemId) => {
    set((state) => ({
      pages: state.pages.map((page) => {
        if (page.index !== pageIndex) return page
        const items = page.items.filter((it) => it.id !== itemId)
        const usedHeightCm = computeUsedHeightCm(items)
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
        const usedHeightCm = computeUsedHeightCm(items)
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

  setCostPerCm2: (cost) => set((state) => ({ costPerCm2: finiteAtLeast(cost, 0, state.costPerCm2) })),

  reset: () => {
    set((state) => {
      state.images.forEach((img) => URL.revokeObjectURL(img.previewUrl))
      return { images: [], pages: [], unplacedImages: [], packingStrategy: null }
    })
  },
}))

// Dev-only handle for automated end-to-end testing of layout/export.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __gangStore?: typeof useGangSheetStore }).__gangStore =
    useGangSheetStore
}
