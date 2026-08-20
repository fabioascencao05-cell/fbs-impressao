import { describe, expect, it } from 'vitest'
import { createPersistedProjectRecord } from './projectPersistence'
import type { PersistableProjectState } from './projectPersistence'

describe('project persistence snapshot', () => {
  it('stores files but never stores temporary object URLs', () => {
    const file = new File(['png'], 'arte.png', { type: 'image/png', lastModified: 123 })
    const state = {
      images: [{
        id: 'image-1', file, previewUrl: 'blob:temporary', naturalWidthPx: 10,
        naturalHeightPx: 20, aspectRatio: 2, quantity: 1, widthCm: 1, heightCm: 2,
        contentXPx: 0, contentYPx: 0, contentWidthPx: 10, contentHeightPx: 20,
      }],
      maxHeightCm: 100,
      canvasWidthCm: 57,
      itemGapCm: 0.3,
      pages: [{ index: 0, usedHeightCm: 2, items: [{
        id: 'item-1', sourceImageId: 'image-1', previewUrl: 'blob:temporary', xCm: 0,
        yCm: 0, widthCm: 1, heightCm: 2, angle: 0, contentXPx: 0, contentYPx: 0,
        contentWidthPx: 10, contentHeightPx: 20, naturalWidthPx: 10, naturalHeightPx: 20,
      }] }],
      zoom: 1,
      sheetBackgroundColor: '#ffffff',
      pricePerMeter: 35,
    } satisfies PersistableProjectState

    const record = createPersistedProjectRecord('user-1', state)
    expect(record.images[0].fileBlob).toBe(file)
    expect(record.images[0]).not.toHaveProperty('previewUrl')
    expect(record.pages[0].items[0]).not.toHaveProperty('previewUrl')
    expect(record.pricePerMeter).toBe(35)
  })
})
