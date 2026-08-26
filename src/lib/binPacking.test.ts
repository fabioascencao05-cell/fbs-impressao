import { describe, expect, it } from 'vitest'
import { packImages } from './binPacking'
import { validateLayout } from './layoutValidation'
import type { GangImage } from '@/types'

function image(id: string, widthCm: number, heightCm: number, quantity = 1): GangImage {
  const widthPx = Math.round(widthCm * 118.11)
  const heightPx = Math.round(heightCm * 118.11)
  return {
    id,
    file: new File([''], `${id}.png`, { type: 'image/png' }),
    previewUrl: `blob:${id}`,
    naturalWidthPx: widthPx,
    naturalHeightPx: heightPx,
    aspectRatio: heightCm / widthCm,
    quantity,
    widthCm,
    heightCm,
    contentXPx: 0,
    contentYPx: 0,
    contentWidthPx: widthPx,
    contentHeightPx: heightPx,
  }
}

describe('packImages', () => {
  it('positions five mixed-size arts without overlap or overflow', () => {
    const result = packImages(
      [image('wide', 18, 7), image('tall', 8, 19), image('square', 11, 11), image('small-a', 5, 6), image('small-b', 7, 4)],
      30,
      57,
      0.3
    )

    expect(result.unplaced).toEqual([])
    expect(result.pages.flatMap((page) => page.items)).toHaveLength(5)
    expect(validateLayout(result.pages, 57, 30)).toEqual([])
  })

  it('uses rotation when it is the only way an art fits the sheet', () => {
    const result = packImages([image('rotate-me', 12, 54)], 20, 57, 0.3)

    expect(result.unplaced).toEqual([])
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].items[0].angle).toBe(90)
    expect(validateLayout(result.pages, 57, 20)).toEqual([])
  })

  it('reports an oversized art instead of placing it outside the printable area', () => {
    const result = packImages([image('too-big', 60, 25)], 30, 57, 0.3)

    expect(result.pages).toEqual([])
    expect(result.unplaced).toEqual([{ sourceImageId: 'too-big', widthCm: 60, heightCm: 25 }])
  })

  it('keeps every requested copy when packing a large quantity', () => {
    const result = packImages([image('logo', 7, 6, 100)], 25, 57, 0.3)

    expect(result.unplaced).toEqual([])
    expect(result.pages.flatMap((page) => page.items)).toHaveLength(100)
    expect(validateLayout(result.pages, 57, 25)).toEqual([])
  })
})
