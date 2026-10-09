import { describe, expect, it } from 'vitest'
import { clampPlacement, dropPlacement, findPageSpace } from './pageEditing'
import { validateLayout } from './layoutValidation'
import type { PlacedItem } from '@/types'

const art: PlacedItem = { id: 'a', sourceImageId: 'a', previewUrl: 'blob:a', xCm: 0, yCm: 0,
  widthCm: 20, heightCm: 10, angle: 90, contentXPx: 10, contentYPx: 10,
  contentWidthPx: 2400, contentHeightPx: 1200, naturalWidthPx: 2420, naturalHeightPx: 1220 }

describe('arraste entre folhas', () => {
  it('converte o ponto de soltura respeitando zoom, rolagem, giro e o ponto onde a arte foi segurada', () => {
    const drag = { pageIndex: 0, itemId: 'a', clientX: 155, clientY: 525, grabXCm: 2, grabYCm: 3 }
    const rect = { left: 100, top: 400, width: 570, height: 2000 }
    const position = dropPlacement(art, drag, rect, 57, 200)
    expect(position).toEqual({ xCm: 3.5, yCm: 9.5 })
    expect(dropPlacement(art, { ...drag, clientX: 210, clientY: 650 },
      { ...rect, width: 1140, height: 4000 }, 57, 200)).toEqual(position)
  })
  it('recusa soltura fora da folha e artes que não cabem sem reduzir suas medidas', () => {
    const drag = { pageIndex: 0, itemId: 'a', clientX: 90, clientY: 525, grabXCm: 2, grabYCm: 3 }
    expect(dropPlacement(art, drag, { left: 100, top: 400, width: 570, height: 2000 }, 57, 200)).toBeNull()
    expect(clampPlacement(art, 0, 0, 57, 19)).toBeNull()
    expect(clampPlacement(art, NaN, 0, 57, 200)).toBeNull()
    expect(clampPlacement(art, 100, 300, 57, 200)).toEqual({ xCm: 47, yCm: 180 })
  })
  it('encontra espaço para o seletor de folhas sem mover outras artes nem perder a margem', () => {
    const existing = { ...art, id: 'b' }
    const before = structuredClone(existing)
    const position = findPageSpace(art, [existing], 57, 200, 0.3)!
    expect(position).toEqual({ xCm: expect.closeTo(10.3), yCm: 0 })
    expect(validateLayout([{ index: 1, usedHeightCm: 20, items: [existing, { ...art, ...position }] }], 57, 200, 0.3)).toEqual([])
    expect(existing).toEqual(before)
    expect(findPageSpace(art, [existing], 10, 20, 0.3)).toBeNull()
  })
})
