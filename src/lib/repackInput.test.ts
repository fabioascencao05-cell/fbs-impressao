import { describe, expect, it } from 'vitest'
import { prepareRepackInput } from './repackInput'
import { optimizeLayout } from './optimizeLayout'
import { validateLayout } from './layoutValidation'
import type { GangImage, PackedPage, PlacedItem } from '@/types'

const image: GangImage = { id: 'art', file: new File([], 'art.png'), previewUrl: 'blob:art', quantity: 3,
  widthCm: 4, heightCm: 2, aspectRatio: .5, contentXPx: 0, contentYPx: 0,
  contentWidthPx: 400, contentHeightPx: 200, naturalWidthPx: 400, naturalHeightPx: 200 }
const item = (id: string, widthCm: number, xCm = 0): PlacedItem => ({ ...image, id, sourceImageId: image.id,
  widthCm, heightCm: widthCm / 2, xCm, yCm: 0, angle: 0 })
const page = (items: PlacedItem[]): PackedPage => ({ index: 0, items, usedHeightCm: 4 })

describe('otimizar mantém o tamanho de cada cópia', () => {
  it('preserva cópias ampliadas e reduzidas, IDs e fontes após otimizar duas vezes', () => {
    const current = [page([item('art-0', 8), item('art-1', 2, 9), item('art-2', 4, 12)])]
    const before = structuredClone(current)
    const first = optimizeLayout([image], 20, 20, .3, current)
    const second = optimizeLayout([image], 20, 20, .3, first.pages)
    for (const result of [first, second]) {
      expect(result.unplaced).toEqual([])
      expect(validateLayout(result.pages, 20, 35, .3)).toEqual([])
      const sizes = result.pages.flatMap(p => p.items).sort((a, b) => a.id.localeCompare(b.id))
        .map(i => [i.id, i.sourceImageId, i.widthCm, i.heightCm, i.contentWidthPx])
      expect(sizes).toEqual([['art-0', 'art', 8, 4, 400], ['art-1', 'art', 2, 1, 400], ['art-2', 'art', 4, 2, 400]])
    }
    expect(current).toEqual(before)
    expect(image.widthCm).toBe(4)
  })
  it('mantém uma cópia grande como não encaixada sem encolhê-la', () => {
    const result = optimizeLayout([{ ...image, quantity: 1 }], 10, 10, .3, [page([item('big', 40)])])
    expect(result.pages).toEqual([])
    expect(result.unplaced).toEqual([{ sourceImageId: 'art', itemId: 'big', widthCm: 40, heightCm: 20 }])
    const repeated = optimizeLayout([{ ...image, quantity: 1 }], 10, 10, .3, result.pages, undefined, result.unplaced)
    expect(repeated.unplaced).toEqual(result.unplaced)
    const enlarged = optimizeLayout([{ ...image, quantity: 1 }], 50, 50, .3, result.pages, undefined, result.unplaced)
    expect(enlarged.pages[0].items[0]).toMatchObject({ id: 'big', sourceImageId: 'art', widthCm: 40, heightCm: 20 })
  })
  it('preserva a cópia editada e acrescenta as pendentes na medida da fila sem IDs repetidos', () => {
    const result = optimizeLayout([image], 20, 20, .3, [page([item('art-1', 8)])])
    const items = result.pages.flatMap(p => p.items)
    expect(items).toHaveLength(3)
    expect(items.find(i => i.id === 'art-1')?.widthCm).toBe(8)
    expect(items.map(i => i.widthCm).sort((a, b) => a - b)).toEqual([4, 4, 8])
    expect(new Set(items.map(i => i.id)).size).toBe(3)
    expect(items.every(i => i.sourceImageId === 'art')).toBe(true)
  })
  it('rejeita cópias duplicadas, fontes desatualizadas e medidas deformadas', () => {
    expect(() => prepareRepackInput([image], [page([item('a', 8), item('a', 8)])])).toThrow('desatualizada')
    expect(() => prepareRepackInput([image], [page([{ ...item('a', 8), contentWidthPx: 1 }])])).toThrow('original')
    expect(() => prepareRepackInput([image], [page([{ ...item('a', 8), heightCm: 5 }])])).toThrow('medidas')
  })
})
