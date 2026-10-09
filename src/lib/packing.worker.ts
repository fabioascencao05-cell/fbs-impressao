import { packImages } from './binPacking'
import { packImagesByShape } from './shapePacking'
import type { GangImage } from '@/types'

self.onmessage = (event: MessageEvent<{ images: GangImage[]; maxHeightCm: number; canvasWidthCm: number; itemGapCm: number }>) => {
  try {
    const { images, maxHeightCm, canvasWidthCm, itemGapCm } = event.data
    const baseline = packImages(images, maxHeightCm, canvasWidthCm, itemGapCm)
    const result = packImagesByShape(images, baseline, canvasWidthCm, maxHeightCm, itemGapCm,
      (done, total) => self.postMessage({ type: 'progress', done, total }))
    self.postMessage({ type: 'result', result })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Falha ao otimizar.' })
  }
}
