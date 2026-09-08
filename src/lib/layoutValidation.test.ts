import { describe, expect, it } from 'vitest'
import { validateLayout } from './layoutValidation'
import type { PackedPage, PlacedItem } from '@/types'

function item(id: string, xCm: number): PlacedItem {
  return {
    id,
    sourceImageId: id,
    previewUrl: `blob:${id}`,
    xCm,
    yCm: 0,
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

function page(secondX: number): PackedPage[] {
  return [{ index: 0, items: [item('first', 0), item('second', secondX)], usedHeightCm: 10 }]
}

describe('validateLayout', () => {
  it('rejeita um ajuste manual com espaço menor que o configurado', () => {
    expect(validateLayout(page(10.29), 57, 100, 0.3)).toEqual([
      expect.objectContaining({ type: 'insufficient-gap' }),
    ])
  })

  it('aceita o espaço exato configurado', () => {
    expect(validateLayout(page(10.3), 57, 100, 0.3)).toEqual([])
  })

  it('continua distinguindo sobreposição de falta de espaço', () => {
    expect(validateLayout(page(9.9), 57, 100, 0.3)).toEqual([
      expect.objectContaining({ type: 'overlap' }),
    ])
  })
})
