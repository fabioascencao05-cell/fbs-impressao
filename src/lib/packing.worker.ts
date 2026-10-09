import { optimizeLayout } from './optimizeLayout'
import type { GangImage, PackedPage } from '@/types'

self.onmessage = (event: MessageEvent<{ images: GangImage[]; maxHeightCm: number; canvasWidthCm: number; itemGapCm: number; currentPages?: PackedPage[] }>) => {
  try {
    const { images, maxHeightCm, canvasWidthCm, itemGapCm, currentPages } = event.data
    const result = optimizeLayout(images, maxHeightCm, canvasWidthCm, itemGapCm, currentPages,
      (done, total) => self.postMessage({ type: 'progress', done, total }))
    self.postMessage({ type: 'result', result })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Falha ao otimizar.' })
  }
}
