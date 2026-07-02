import { create } from 'zustand'
import { packImages } from '@/lib/binPacking'
import { DEFAULT_MAX_HEIGHT_CM } from '@/lib/constants'
import type { GangImage, PackedPage } from '@/types'

interface GangSheetState {
  images: GangImage[]
  maxHeightCm: number
  pages: PackedPage[]

  addImages: (files: File[]) => Promise<void>
  removeImage: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  updateWidthCm: (id: string, widthCm: number) => void
  setMaxHeightCm: (heightCm: number) => void
  generateLayout: () => void
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

export const useGangSheetStore = create<GangSheetState>((set, get) => ({
  images: [],
  maxHeightCm: DEFAULT_MAX_HEIGHT_CM,
  pages: [],

  addImages: async (files) => {
    const pngFiles = files.filter((f) => f.type === 'image/png')
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
  },

  removeImage: (id) => {
    set((state) => ({ images: state.images.filter((img) => img.id !== id) }))
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

  reset: () => set({ images: [], pages: [] }),
}))
