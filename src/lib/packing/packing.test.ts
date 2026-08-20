import { describe, expect, it } from 'vitest'
import { PackingError, packImages } from '@/lib/binPacking'
import { createInkMap } from '@/lib/packing/mask'
import type { GangImage, PackingMask } from '@/types'

function rgba(width: number, height: number, pixels: Array<[number, number, number, number]>) {
  const data = new Uint8ClampedArray(width * height * 4)
  pixels.forEach((pixel, index) => data.set(pixel, index * 4))
  return data
}

function image(id: string, widthCm: number, heightCm: number, mask?: PackingMask): GangImage {
  return {
    id,
    file: { name: `${id}.png` } as File,
    previewUrl: `${id}.png`,
    naturalWidthPx: 100,
    naturalHeightPx: 100,
    aspectRatio: heightCm / widthCm,
    quantity: 1,
    widthCm,
    heightCm,
    contentXPx: 0,
    contentYPx: 0,
    contentWidthPx: 100,
    contentHeightPx: 100,
    packingMask: mask,
  }
}

describe('ink masks', () => {
  it('uses alpha when transparency exists', () => {
    const data = rgba(2, 2, [
      [255, 0, 0, 255],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 255, 255],
    ])
    expect([...createInkMap(data, 2, 2)]).toEqual([1, 0, 0, 1])
  })

  it('removes a reliable uniform background from an opaque image', () => {
    const pixels = Array.from({ length: 9 }, () => [245, 245, 245, 255] as [number, number, number, number])
    pixels[4] = [20, 80, 180, 255]
    expect([...createInkMap(rgba(3, 3, pixels), 3, 3)]).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0])
  })

  it('keeps an opaque image solid when its border is not a reliable background', () => {
    const pixels = Array.from({ length: 9 }, (_, index) =>
      [index * 25, 255 - index * 25, index * 13, 255] as [number, number, number, number]
    )
    expect([...createInkMap(rgba(3, 3, pixels), 3, 3)]).toEqual(Array(9).fill(1))
  })
})

describe('shape-aware packing', () => {
  it('mixes complementary silhouettes in the same rectangular footprint', () => {
    const diagonalA: PackingMask = { widthPx: 2, heightPx: 2, data: new Uint8Array([1, 0, 0, 1]) }
    const diagonalB: PackingMask = { widthPx: 2, heightPx: 2, data: new Uint8Array([0, 1, 1, 0]) }
    const pages = packImages([image('a', 2, 2, diagonalA), image('b', 2, 2, diagonalB)], 2, 2, 0)

    expect(pages).toHaveLength(1)
    expect(pages[0].items).toHaveLength(2)
    expect(pages[0].items.map((item) => [item.xCm, item.yCm])).toEqual([
      [0, 0],
      [0, 0],
    ])
  })

  it('rotates an item when that is the only orientation that fits', () => {
    const solid: PackingMask = { widthPx: 3, heightPx: 1, data: new Uint8Array([1, 1, 1]) }
    const pages = packImages([image('wide', 3, 1, solid)], 3, 2, 0)
    expect(pages[0].items[0].angle).toBe(90)
  })

  it('rejects impossible items instead of placing them outside the sheet', () => {
    expect(() => packImages([image('oversize', 4, 5)], 3, 2, 0.2)).toThrow(PackingError)
  })
})
