import { create } from 'zustand'
import { packImages } from '@/lib/binPacking'
import { packImagesByShape, type PackUnitInput } from '@/lib/shapePacking'
import type { PackRequest, PackResponse } from '@/lib/packWorker'
import { computeArtGeometry } from '@/lib/trimImage'
import { usedLengthCm } from '@/lib/placedGeometry'
import { releaseImageElement } from '@/lib/imageCache'
import {
  DEFAULT_CANVAS_WIDTH_CM,
  DEFAULT_ITEM_GAP_CM,
  DEFAULT_MAX_HEIGHT_CM,
  DEFAULT_PRICE_PER_METER,
  EXPORT_PX_PER_CM,
  ZOOM_MAX,
  ZOOM_MIN,
} from '@/lib/constants'
import type { GangImage, PackedPage, PlacedItem } from '@/types'

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const PRICE_STORAGE_KEY = 'gang-sheet-price-per-meter'

function loadPrice(): number {
  const raw = localStorage.getItem(PRICE_STORAGE_KEY)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_PRICE_PER_METER
}

interface GangSheetState {
  images: GangImage[]
  maxHeightCm: number
  canvasWidthCm: number
  itemGapCm: number
  pages: PackedPage[]
  zoom: number
  sheetBackgroundColor: string
  pricePerLinearMeter: number
  isPacking: boolean
  packProgress: number // 0..1

  addImages: (files: File[]) => Promise<{ added: number; skipped: number }>
  removeImage: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  updateWidthCm: (id: string, widthCm: number) => void
  setMaxHeightCm: (heightCm: number) => void
  setCanvasWidthCm: (widthCm: number) => void
  setItemGapCm: (gapCm: number) => void
  generateLayout: () => Promise<void>
  updatePlacedItem: (pageIndex: number, itemId: string, patch: Partial<PlacedItem>) => void
  removePlacedItem: (pageIndex: number, itemId: string) => void
  duplicatePlacedItem: (pageIndex: number, itemId: string) => void
  removePage: (pageIndex: number) => void
  setZoom: (zoom: number) => void
  setSheetBackgroundColor: (color: string) => void
  setPricePerLinearMeter: (price: number) => void
  reset: () => void
}

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

function toPackUnits(images: GangImage[]): PackUnitInput[] {
  return images.map((img) => ({
    id: img.id,
    sourceImageId: img.id,
    previewUrl: img.previewUrl,
    widthCm: img.widthCm,
    heightCm: img.heightCm,
    contentXPx: img.contentXPx,
    contentYPx: img.contentYPx,
    contentWidthPx: img.contentWidthPx,
    contentHeightPx: img.contentHeightPx,
    naturalWidthPx: img.naturalWidthPx,
    naturalHeightPx: img.naturalHeightPx,
    quantity: img.quantity,
    mask: img.mask
      ? {
          cols: img.mask.cols,
          rows: img.mask.rows,
          // Copy so the transfer/clone to the worker never detaches the store's buffer.
          data: Uint8Array.from(img.mask.data),
          hasAlpha: img.mask.hasAlpha,
        }
      : undefined,
  }))
}

/** Runs the shape packer in a Web Worker; resolves null if the worker is unusable. */
function packInWorker(
  units: PackUnitInput[],
  options: { maxHeightCm: number; canvasWidthCm: number; itemGapCm: number },
  onProgress: (p: number) => void
): Promise<PackedPage[] | null> {
  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('../lib/packWorker.ts', import.meta.url), { type: 'module' })
    } catch {
      resolve(null)
      return
    }
    const cleanup = () => worker.terminate()
    worker.onmessage = (e: MessageEvent<PackResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        onProgress(msg.total > 0 ? msg.done / msg.total : 0)
      } else if (msg.type === 'done') {
        cleanup()
        resolve(msg.pages)
      } else {
        cleanup()
        resolve(null)
      }
    }
    worker.onerror = () => {
      cleanup()
      resolve(null)
    }
    const req: PackRequest = { units, options, useShape: true }
    worker.postMessage(req)
  })
}

export const useGangSheetStore = create<GangSheetState>((set, get) => ({
  images: [],
  maxHeightCm: DEFAULT_MAX_HEIGHT_CM,
  canvasWidthCm: DEFAULT_CANVAS_WIDTH_CM,
  itemGapCm: DEFAULT_ITEM_GAP_CM,
  pages: [],
  zoom: 1,
  sheetBackgroundColor: 'checkerboard',
  pricePerLinearMeter: loadPrice(),
  isPacking: false,
  packProgress: 0,

  addImages: async (files) => {
    const accepted = files.filter((f) => ACCEPTED_TYPES.has(f.type))
    const skipped = files.length - accepted.length

    const newImages = await Promise.all(
      accepted.map(async (file): Promise<GangImage> => {
        const { box, mask } = await computeArtGeometry(file)
        const aspectRatio = box.heightPx / box.widthPx
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
          mask,
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
        img.id === id && widthCm > 0 ? { ...img, widthCm, heightCm: widthCm * img.aspectRatio } : img
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

  generateLayout: async () => {
    const { images, maxHeightCm, canvasWidthCm, itemGapCm } = get()
    if (images.length === 0) {
      set({ pages: [] })
      return
    }

    set({ isPacking: true, packProgress: 0 })
    const options = { maxHeightCm, canvasWidthCm, itemGapCm }
    const units = toPackUnits(images)

    try {
      // Preferred path: shape-aware packing off the main thread.
      const workerPages = await packInWorker(units, options, (p) => set({ packProgress: p }))
      if (workerPages) {
        set({ pages: workerPages })
        return
      }
      // Fallback 1: run the shape packer synchronously (worker unavailable).
      try {
        const pages = packImagesByShape(units, options, (p) =>
          set({ packProgress: p.total ? p.done / p.total : 0 })
        )
        set({ pages })
        return
      } catch {
        // Fallback 2: legacy rectangular MaxRects packer.
        set({ pages: packImages(images, maxHeightCm, canvasWidthCm, itemGapCm) })
      }
    } finally {
      set({ isPacking: false, packProgress: 1 })
    }
  },

  updatePlacedItem: (pageIndex, itemId, patch) => {
    set((state) => ({
      pages: state.pages.map((page) => {
        if (page.index !== pageIndex) return page
        const items = page.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it))
        return { ...page, items, usedHeightCm: usedLengthCm(items) }
      }),
    }))
  },

  removePlacedItem: (pageIndex, itemId) => {
    set((state) => ({
      pages: state.pages.map((page) => {
        if (page.index !== pageIndex) return page
        const items = page.items.filter((it) => it.id !== itemId)
        return { ...page, items, usedHeightCm: usedLengthCm(items) }
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
          id: `${source.sourceImageId}-dup-${crypto.randomUUID()}`,
          xCm: source.xCm + 1,
          yCm: source.yCm + 1,
        }
        const items = [...page.items, clone]
        return { ...page, items, usedHeightCm: usedLengthCm(items) }
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

  setPricePerLinearMeter: (price) => {
    const clamped = Math.max(0, price || 0)
    localStorage.setItem(PRICE_STORAGE_KEY, String(clamped))
    set({ pricePerLinearMeter: clamped })
  },

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
  ;(window as unknown as { __gangStore?: typeof useGangSheetStore }).__gangStore = useGangSheetStore
}
