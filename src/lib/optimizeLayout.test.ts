import { describe, expect, it } from 'vitest'
import { compactBlankBands } from './compactBands'
import { keepEconomicalLayout } from './optimizeLayout'
import { packingScore } from './packingScore'
import { calculateConsumption } from './consumption'
import { validateLayout } from './layoutValidation'
import type { PackingResult } from './binPacking'
import type { GangImage, PlacedItem } from '@/types'

const art = (id: string, xCm: number, yCm: number, angle = 0): PlacedItem => ({
  id, sourceImageId: 'art', previewUrl: 'blob:art', xCm, yCm, widthCm: 10, heightCm: 5, angle,
  contentXPx: 0, contentYPx: 0, contentWidthPx: 1000, contentHeightPx: 500, naturalWidthPx: 1000, naturalHeightPx: 500,
})
const result = (items: PlacedItem[], usedHeightCm: number): PackingResult => ({
  pages: [{ index: 0, items, usedHeightCm }], unplaced: [], strategy: 'teste',
})
const images = [{ ...art('art', 0, 0), file: new File([], 'art.png'), aspectRatio: 0.5, quantity: 2 }] as GangImage[]

describe('economia de filme', () => {
  it('remove a faixa vazia como a vista entre grupos da última folha, sem mudar dimensões ou giros', () => {
    const original = result([art('a', 0, 3), art('b', 20, 3, 90), art('c', 0, 70)], 75)
    const before = structuredClone(original)
    const packed = compactBlankBands(original, 0.3)
    expect(packed.pages[0].usedHeightCm).toBeCloseTo(15.3)
    expect(packed.pages[0].items.map(item => [item.id, item.xCm, item.angle]))
      .toEqual([['a', 0, 0], ['b', 20, 90], ['c', 0, 0]])
    expect(packed.pages[0].items.map(item => item.yCm)).toEqual([0, 0, expect.closeTo(10.3)])
    expect(validateLayout(packed.pages, 57, 200, 0.3)).toEqual([])
    expect(original).toEqual(before)
    expect(calculateConsumption(packed.pages, 57, 55).cost).toBeLessThan(calculateConsumption(original.pages, 57, 55).cost)
  })
  it('não remove uma faixa atravessada por outra arte nem aumenta o espaço já existente', () => {
    const original = result([art('a', 0, 0, 90), art('b', 20, 4), art('c', 40, 8)], 13)
    expect(compactBlankBands(original, 0.3)).toBe(original)
    const touching = result([art('a', 0, 0), art('b', 20, 5.1)], 10.1)
    expect(compactBlankBands(touching, 0.3)).toBe(touching)
  })
  it('compara primeiro metragem e só usa quantidade de páginas como desempate', () => {
    const one = result([art('a', 0, 0), art('b', 20, 30)], 35)
    const two: PackingResult = { ...one, pages: [result([art('a', 0, 0)], 5).pages[0],
      { ...result([art('b', 0, 0)], 5).pages[0], index: 1 }] }
    expect(packingScore(two)[1]).toBeLessThan(packingScore(one)[1])
    expect(keepEconomicalLayout(images, two.pages, one, 57, 200, 0.3).pages).toBe(two.pages)
  })
  it('conserva a posição manual quando a nova busca tem o mesmo custo', () => {
    const incumbent = result([art('a', 20, 0), art('b', 40, 0)], 999)
    const proposed = result([art('a', 0, 0), art('b', 10.3, 0)], 5)
    expect(keepEconomicalLayout(images, incumbent.pages, proposed, 57, 200, 0.3).pages).toBe(incumbent.pages)
  })
  it('não aceita uma montagem barata que sobrepõe artes ou tem quantidade desatualizada', () => {
    const overlapping = result([art('a', 0, 0), art('b', 0, 0)], 5)
    const proposed = result([art('a', 0, 0), art('b', 10.3, 0)], 5)
    expect(keepEconomicalLayout(images, overlapping.pages, proposed, 57, 200, 0.3)).toBe(proposed)
    expect(keepEconomicalLayout(images, result([art('a', 0, 0)], 5).pages, proposed, 57, 200, 0.3)).toBe(proposed)
  })
})
