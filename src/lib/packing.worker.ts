import { packImages } from './binPacking'
import { packImagesByShape } from './shapePacking'
import { validateLayout } from './layoutValidation'
import type { GangImage } from '@/types'

self.onmessage = (event: MessageEvent<{ images: GangImage[]; maxHeightCm: number; canvasWidthCm: number; itemGapCm: number }>) => {
  try {
    const { images, maxHeightCm, canvasWidthCm, itemGapCm } = event.data
    self.postMessage({ type: 'progress', done: 0, total: 1 })
    const baseline = packImages(images, maxHeightCm, canvasWidthCm, itemGapCm)
    let pages = baseline.pages
    if (!baseline.unplaced.length) {
      const shape = packImagesByShape(images, pages, canvasWidthCm, maxHeightCm, itemGapCm,
        (done, total) => self.postMessage({ type: 'progress', done, total }))
      if (!validateLayout(shape, canvasWidthCm, maxHeightCm, itemGapCm).length) pages = shape
    }
    self.postMessage({ type: 'result', result: { ...baseline, pages, strategy: pages === baseline.pages ? baseline.strategy : 'contorno-real' }, baselineLength: baseline.pages.reduce((sum, page) => sum + Math.min(maxHeightCm, Math.max(0.1, page.usedHeightCm + 0.1)), 0) })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Falha ao otimizar.' })
  }
}
