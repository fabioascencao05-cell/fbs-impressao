import { beforeEach, describe, expect, it } from 'vitest'
import { useGangSheetStore } from './useGangSheetStore'
import type { GangImage, PlacedItem } from '@/types'

function sourceImage(id: string): GangImage {
  return {
    id,
    file: new File(['art'], `${id}.png`, { type: 'image/png' }),
    previewUrl: `blob:${id}`,
    naturalWidthPx: 1_000,
    naturalHeightPx: 1_000,
    aspectRatio: 1,
    quantity: 1,
    widthCm: 10,
    heightCm: 10,
    contentXPx: 0,
    contentYPx: 0,
    contentWidthPx: 1_000,
    contentHeightPx: 1_000,
  }
}

function placed(id: string, sourceImageId: string, yCm: number): PlacedItem {
  return {
    id,
    sourceImageId,
    previewUrl: `blob:${sourceImageId}`,
    xCm: 0,
    yCm,
    widthCm: 10,
    heightCm: 10,
    angle: 0,
    contentXPx: 0,
    contentYPx: 0,
    contentWidthPx: 1_000,
    contentHeightPx: 1_000,
    naturalWidthPx: 1_000,
    naturalHeightPx: 1_000,
  }
}

describe('validade do layout DTF', () => {
  beforeEach(() => {
    useGangSheetStore.setState({ images: [], pages: [], unplacedImages: [], packingStrategy: null })
  })

  it('descarta o layout antigo quando a medida de uma arte muda', () => {
    const art = sourceImage('art')
    useGangSheetStore.setState({
      images: [art],
      pages: [{ index: 0, items: [placed('art-0', art.id, 0)], usedHeightCm: 10 }],
      packingStrategy: 'area/short-side',
    })

    useGangSheetStore.getState().updateWidthCm(art.id, 15)

    expect(useGangSheetStore.getState().pages).toEqual([])
    expect(useGangSheetStore.getState().packingStrategy).toBeNull()
  })

  it.each([
    ['quantidade', () => useGangSheetStore.getState().updateQuantity('art', 2)],
    ['largura da folha', () => useGangSheetStore.getState().setCanvasWidthCm(56)],
    ['altura da página', () => useGangSheetStore.getState().setMaxHeightCm(80)],
    ['espaçamento', () => useGangSheetStore.getState().setItemGapCm(0.5)],
  ])('descarta o layout antigo quando muda %s', (_label, change) => {
    const art = sourceImage('art')
    useGangSheetStore.setState({
      images: [art],
      pages: [{ index: 0, items: [placed('art-0', art.id, 0)], usedHeightCm: 10 }],
      packingStrategy: 'area/short-side',
    })

    change()

    expect(useGangSheetStore.getState().pages).toEqual([])
    expect(useGangSheetStore.getState().packingStrategy).toBeNull()
  })

  it('reduz a altura usada quando a arte mais baixa é removida', () => {
    const first = sourceImage('first')
    const last = sourceImage('last')
    useGangSheetStore.setState({
      images: [first, last],
      pages: [{ index: 0, items: [placed('first-0', first.id, 0), placed('last-0', last.id, 20)], usedHeightCm: 30 }],
    })

    useGangSheetStore.getState().removeImage(last.id)

    expect(useGangSheetStore.getState().pages[0].usedHeightCm).toBe(10)
  })
})
