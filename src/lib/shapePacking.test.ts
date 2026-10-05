import { describe, expect, it } from 'vitest'
import { packImages } from './binPacking'
import { packImagesByShape } from './shapePacking'
import { validateLayout } from './layoutValidation'
import type { GangImage, OccupancyMask, PackedPage } from '@/types'

function image(id: string, widthCm: number, heightCm: number, occupancyMask?: OccupancyMask, rotationLocked = false): GangImage {
  return { id, file: new File([''], id + '.png', { type: 'image/png' }), previewUrl: 'blob:' + id,
    naturalWidthPx: widthCm * 100, naturalHeightPx: heightCm * 100, aspectRatio: heightCm / widthCm,
    quantity: 1, widthCm, heightCm, contentXPx: 0, contentYPx: 0,
    contentWidthPx: widthCm * 100, contentHeightPx: heightCm * 100, occupancyMask, rotationLocked }
}

const lMask: OccupancyMask = { cols: 10, rows: 10, data: Uint8Array.from({ length: 100 }, (_, i) => i < 10 || i % 10 === 0 ? 1 : 0) }

function place(pages: PackedPage[], id: string, xCm: number, yCm: number) {
  const item = pages.flatMap((page) => page.items).find((item) => item.sourceImageId === id)!
  item.xCm = xCm
  item.yCm = yCm
  item.angle = 0
  return pages
}

describe('encaixe pelo canal alfa', () => {
  it('encaixa na concavidade aberta, mesmo com retângulos sobrepostos, preservando 3 mm', () => {
    const images = [image('L', 10, 10, lMask), image('small', 3, 3)]
    const baseline = packImages(images, 20, 10, 0.3)
    const pages = packImagesByShape(images, baseline.pages, 10, 20, 0.3)
    expect(pages.reduce((total, page) => total + page.usedHeightCm, 0)).toBeLessThan(10.5)
    expect(pages.flatMap((page) => page.items)).toHaveLength(2)
    expect(validateLayout(pages, 10, 20, 0.3)).toEqual([])
    const [a, b] = pages[0].items
    expect(a.xCm < b.xCm + b.widthCm && b.xCm < a.xCm + a.widthCm).toBe(true)
  })

  it('aceita edição manual na concavidade e bloqueia distância insuficiente', () => {
    const images = [image('L', 10, 10, lMask), image('small', 3, 3)]
    const baseline = packImages(images, 20, 10, 0.3)
    const pages = place(place(baseline.pages, 'L', 0, 0), 'small', 1.3, 1.3)
    pages[0].items.push(...pages.slice(1).flatMap((page) => page.items))
    expect(validateLayout(pages.slice(0, 1), 10, 20, 0.3)).toEqual([])
    place(pages, 'small', 1.2, 1.2)
    expect(validateLayout(pages.slice(0, 1), 10, 20, 0.3).some((issue) => issue.type === 'insufficient-gap')).toBe(true)
  })

  it('mantém arte sem transparência como retângulo sólido', () => {
    const images = [image('solid', 10, 10), image('small', 3, 3)]
    const baseline = packImages(images, 20, 10, 0.3)
    expect(packImagesByShape(images, baseline.pages, 10, 20, 0.3)).toBe(baseline.pages)
  })

  it('respeita bloqueio de rotação por arte', () => {
    const locked = image('locked', 8, 3, lMask, true)
    const baseline = packImages([locked], 20, 10, 0.3)
    const pages = packImagesByShape([locked], baseline.pages, 10, 20, 0.3)
    expect(pages[0].items[0].angle).toBe(0)
  })

  it('bloqueia validação quando falta cópia ou existe giro livre', () => {
    const source = image('copies', 4, 4)
    source.quantity = 2
    const baseline = packImages([source], 20, 10, 0.3)
    const oneCopy: PackedPage = { ...baseline.pages[0], items: baseline.pages[0].items.slice(0, 1) }
    expect(validateLayout([oneCopy], 10, 20, 0.3, [source]).some((issue) => issue.type === 'missing-copy')).toBe(true)
    oneCopy.items[0].angle = 45
    expect(validateLayout([oneCopy], 10, 20, 0.3, [source]).some((issue) => issue.type === 'invalid-transform')).toBe(true)
  })

  it('valida o contorno após giro de 90° sem tratar pixels brancos como vazio', () => {
    const images = [image('L', 10, 10, lMask), image('white', 3, 3)]
    const baseline = packImages(images, 20, 10, 0.3)
    const items = baseline.pages.flatMap((page) => page.items)
    const large = items.find((item) => item.sourceImageId === 'L')!
    const white = items.find((item) => item.sourceImageId === 'white')!
    const page: PackedPage = { index: 0, items: [{ ...large, xCm: 0, yCm: 0, angle: 90 },
      { ...white, xCm: 1.3, yCm: 1.3, angle: 0 }], usedHeightCm: 10 }
    expect(validateLayout([page], 10, 20, 0.3)).toEqual([])
    page.items[1].yCm = 1.2
    expect(validateLayout([page], 10, 20, 0.3).some((issue) => issue.type === 'insufficient-gap')).toBe(true)
  })
})
