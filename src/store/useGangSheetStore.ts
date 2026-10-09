import { create } from 'zustand'
import { proportionatePatch } from '@/lib/exportPlan'
import type { packImages } from '@/lib/binPacking'
import { rotatedAabbCm } from '@/lib/geometry'
import { computeContentBox } from '@/lib/trimImage'
import { readOccupancyMask } from '@/lib/shapeMask'
import { readImageResolutionDpi } from '@/lib/imageResolution'
import { defaultPrintWidthCm } from '@/lib/printQuality'
import { clampPlacement } from '@/lib/pageEditing'
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
  trimExportHeight: boolean
  setTrimExportHeight: (trim: boolean) => void
  maxHeightCm: number
  canvasWidthCm: number
  itemGapCm: number
  pages: PackedPage[]
  unplacedImages: Array<{ sourceImageId: string; widthCm: number; heightCm: number }>
  packingStrategy: string | null
  packingError: string | null
  packingProgress: { done: number; total: number } | null
  zoom: number
  sheetBackgroundColor: string
  costPerMeter: number

  addImages: (files: File[]) => Promise<{ added: number; skipped: number }>
  removeImage: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  updateWidthCm: (id: string, widthCm: number) => void
  setMaxHeightCm: (heightCm: number) => void
  setCanvasWidthCm: (widthCm: number) => void
  setItemGapCm: (gapCm: number) => void
  generateLayout: () => Promise<boolean>
  cancelPacking: () => void
  updatePlacedItem: (pageIndex: number, itemId: string, patch: Partial<PlacedItem>) => void
  removePlacedItem: (pageIndex: number, itemId: string) => void
  movePlacedItem: (pageIndex: number, itemId: string, targetPageIndex: number, xCm: number, yCm: number) => boolean
  addPage: () => number
  duplicatePlacedItem: (pageIndex: number, itemId: string) => void
  removePage: (pageIndex: number) => void
  setZoom: (zoom: number) => void
  setSheetBackgroundColor: (color: string) => void
  setCostPerMeter: (cost: number) => void
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

function removeCopies(images: GangImage[], removed: PlacedItem[]) {
  const counts = new Map<string, number>()
  for (const item of removed) counts.set(item.sourceImageId, (counts.get(item.sourceImageId) ?? 0) + 1)
  return images.flatMap(image => {
    const quantity = image.quantity - (counts.get(image.id) ?? 0)
    if (quantity > 0) return [{ ...image, quantity }]
    URL.revokeObjectURL(image.previewUrl)
    return []
  })
}

const clearedLayout = () => ({
  pages: [] as PackedPage[],
  unplacedImages: [] as GangSheetState['unplacedImages'],
  packingStrategy: null,
  packingProgress: null,
  packingError: null,
})

let activeWorker: Worker | null = null
let activeResolve: ((finished: boolean) => void) | null = null
function stopWorker() {
  activeWorker?.terminate()
  activeWorker = null
  const resolve = activeResolve
  activeResolve = null
  resolve?.(false)
}

export const useGangSheetStore = create<GangSheetState>((set, get) => ({
  images: [],
  trimExportHeight: false,
  setTrimExportHeight: (trim) => set({ trimExportHeight: trim }),
  maxHeightCm: DEFAULT_MAX_HEIGHT_CM,
  canvasWidthCm: DEFAULT_CANVAS_WIDTH_CM,
  itemGapCm: DEFAULT_ITEM_GAP_CM,
  pages: [],
  unplacedImages: [],
  packingStrategy: null,
  packingProgress: null,
  zoom: 1,
  sheetBackgroundColor: '#ffffff',
  costPerMeter: 55,
  packingError: null,

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
            const [box, sourceDpi] = await Promise.all([computeContentBox(file), readImageResolutionDpi(file)])
            const occupancyMask = await readOccupancyMask(file, box)
            const aspectRatio = box.heightPx / box.widthPx
            const widthCm = sourceDpi ? box.widthPx / sourceDpi * 2.54 : defaultPrintWidthCm(box.widthPx)
            const image: GangImage = {
              id: crypto.randomUUID(),
              file,
              previewUrl: URL.createObjectURL(file),
              naturalWidthPx: box.naturalWidthPx,
              naturalHeightPx: box.naturalHeightPx,
              aspectRatio,
              quantity: 1,
              sourceDpi,
              occupancyMask: occupancyMask ?? undefined,
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

    if (!newImages.length) return { added: 0, skipped }
    stopWorker()
    set((state) => ({ images: [...state.images, ...newImages], ...clearedLayout() }))
    return { added: newImages.length, skipped }
  },

  removeImage: (id) => {
    stopWorker()
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
        packingProgress: null,
      }
    })
  },

  updateQuantity: (id, quantity) => {
    stopWorker()
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, quantity: Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : img.quantity } : img
      ),
      ...clearedLayout(),
    }))
  },

  updateWidthCm: (id, widthCm) => {
    stopWorker()
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
    const state = get()
    const next = finiteAtLeast(heightCm, 1, state.maxHeightCm)
    if (next === state.maxHeightCm) return
    stopWorker()
    // Enlarging only empty workspace must preserve both manual positions and cost.
    const fits = state.pages.some(page => page.items.length > 0)
      && state.pages.every(page => computeUsedHeightCm(page.items) <= next)
      && !state.unplacedImages.length
    set({ maxHeightCm: next, ...(fits ? { packingProgress: null } : clearedLayout()) })
  },

  setCanvasWidthCm: (widthCm) => {
    stopWorker()
    set((state) => ({ canvasWidthCm: finiteAtLeast(widthCm, 1, state.canvasWidthCm), ...clearedLayout() }))
  },

  setItemGapCm: (gapCm) => {
    stopWorker()
    set((state) => ({ itemGapCm: finiteAtLeast(gapCm, 0, state.itemGapCm), ...clearedLayout() }))
  },

  generateLayout: () => {
    stopWorker()
    const { images, maxHeightCm, canvasWidthCm, itemGapCm, pages } = get()
    if (!images.length) { set(clearedLayout()); return Promise.resolve(false) }
    set({ packingProgress: { done: 0, total: 1 }, packingError: null })
    return new Promise<boolean>((resolve, reject) => {
      let worker: Worker
      try {
        worker = new Worker(new URL('../lib/packing.worker.ts', import.meta.url), { type: 'module' })
      } catch (error) { set({ packingProgress: null, packingError: error instanceof Error ? error.message : 'Falha ao otimizar.' }); reject(error); return }
      activeWorker = worker
      activeResolve = resolve
      worker.onmessage = (event: MessageEvent<{ type: string; done?: number; total?: number; result?: ReturnType<typeof packImages>; message?: string }>) => {
        if (worker !== activeWorker) return
        if (event.data.type === 'progress') {
          set({ packingProgress: { done: event.data.done ?? 0, total: event.data.total ?? 1 } })
          return
        }
        activeResolve = null
        stopWorker()
        if (event.data.type === 'error' || !event.data.result) {
          set({ packingProgress: null })
          reject(new Error(event.data.message ?? 'Falha ao otimizar.'))
          return
        }
        const current = get()
        if (current.images === images && current.maxHeightCm === maxHeightCm && current.canvasWidthCm === canvasWidthCm && current.itemGapCm === itemGapCm) {
          const result = event.data.result
          set({ pages: result.pages, unplacedImages: result.unplaced, packingStrategy: result.strategy, packingProgress: null })
        } else set({ packingProgress: null })
        resolve(current.images === images && current.maxHeightCm === maxHeightCm && current.canvasWidthCm === canvasWidthCm && current.itemGapCm === itemGapCm)
      }
      worker.onerror = (event) => {
        if (worker !== activeWorker) return
        activeResolve = null
        stopWorker()
        set({ packingProgress: null })
        reject(new Error(event.message || 'Falha ao otimizar.'))
      }
      // Files are only decoded on upload. The worker needs geometry and alpha,
      // not another structured clone of every original image file.
      try {
        worker.postMessage({ images: images.map(image => ({ ...image, file: undefined })), maxHeightCm, canvasWidthCm, itemGapCm, currentPages: pages })
      } catch (error) {
        activeResolve = null
        stopWorker()
        set({ packingProgress: null })
        reject(error)
      }
    })
  },

  cancelPacking: () => { stopWorker(); set({ packingProgress: null }) },

  updatePlacedItem: (pageIndex, itemId, patch) => {
    get().cancelPacking()
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
    get().cancelPacking()
    set((state) => {
      const removed = state.pages.find(page => page.index === pageIndex)?.items.filter(item => item.id === itemId) ?? []
      return { images: removeCopies(state.images, removed),
        pages: state.pages.map((page) => {
          if (page.index !== pageIndex) return page
          const items = page.items.filter((it) => it.id !== itemId)
          const usedHeightCm = computeUsedHeightCm(items)
          return { ...page, items, usedHeightCm }
        }), packingStrategy: null }
    })
  },

  movePlacedItem: (pageIndex, itemId, targetPageIndex, xCm, yCm) => {
    const state = get()
    const item = state.pages.find(page => page.index === pageIndex)?.items.find(item => item.id === itemId)
    if (!item || pageIndex === targetPageIndex || !state.pages.some(page => page.index === targetPageIndex)) return false
    const position = clampPlacement(item, xCm, yCm, state.canvasWidthCm, state.maxHeightCm)
    if (!position) return false
    get().cancelPacking()
    set({ pages: state.pages.map(page => {
      if (page.index !== pageIndex && page.index !== targetPageIndex) return page
      const items = page.index === pageIndex ? page.items.filter(other => other.id !== itemId)
        : [...page.items, { ...item, ...position }]
      return { ...page, items, usedHeightCm: computeUsedHeightCm(items) }
    }), packingStrategy: null })
    return true
  },

  addPage: () => {
    get().cancelPacking()
    const index = Math.max(-1, ...get().pages.map(page => page.index)) + 1
    set(state => ({ pages: [...state.pages, { index, items: [], usedHeightCm: 0 }] }))
    return index
  },

  duplicatePlacedItem: (pageIndex, itemId) => {
    get().cancelPacking()
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
        const usedHeightCm = computeUsedHeightCm(items)
        return { ...page, items, usedHeightCm }
      }),
      images: state.images.map(image => state.pages.find(page => page.index === pageIndex)?.items
        .some(item => item.id === itemId && item.sourceImageId === image.id) ? { ...image, quantity: image.quantity + 1 } : image),
    }))
  },

  removePage: (pageIndex) => {
    get().cancelPacking()
    set((state) => ({
      images: removeCopies(state.images, state.pages.find(page => page.index === pageIndex)?.items ?? []),
      pages: state.pages
        .filter((page) => page.index !== pageIndex)
        .map((page, index) => ({ ...page, index })),
    }))
  },

  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),

  setSheetBackgroundColor: (color) => set({ sheetBackgroundColor: color }),

  setCostPerMeter: (cost) => set((state) => ({ costPerMeter: finiteAtLeast(cost, 0, state.costPerMeter) })),

  reset: () => {
    stopWorker()
    set((state) => {
      state.images.forEach((img) => URL.revokeObjectURL(img.previewUrl))
      return { images: [], ...clearedLayout() }
    })
  },
}))

// Dev-only handle for automated end-to-end testing of layout/export.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __gangStore?: typeof useGangSheetStore }).__gangStore =
    useGangSheetStore
}
