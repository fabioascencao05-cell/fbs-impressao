import { describe, expect, it } from 'vitest'
import {
  alphaPlaneFromRgba,
  analyzeBinaryAlpha,
  pixelSquareDistancePx,
  validateRasterPair,
} from './finalRasterValidation'

function raster(rows: string[], originX = 0, originY = 0) {
  const height = rows.length
  const width = rows[0].length
  const alpha = new Uint8Array(width * height)
  rows.forEach((row, y) => [...row].forEach((cell, x) => {
    alpha[y * width + x] = cell === '#' ? 1 : 0
  }))
  return analyzeBinaryAlpha(alpha, width, height, originX, originY)
}

describe('validação raster final DTF', () => {
  it('considera branco e semitransparência como impressão e ignora RGB com alfa zero', () => {
    const rgba = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 1,
      255, 0, 0, 0,
    ])
    expect([...alphaPlaneFromRgba(rgba)]).toEqual([1, 1, 0])
  })

  it('reconhece uma imagem totalmente transparente como vazia', () => {
    const mask = analyzeBinaryAlpha(new Uint8Array(12), 4, 3)
    expect(mask.empty).toBe(true)
    expect(mask.boundary.length).toBe(0)
  })

  it('aceita retângulos sobrepostos quando os pixels impressos não se encostam', () => {
    const lShape = raster([
      '#..',
      '#..',
      '###',
    ])
    const dotInsideBoundingBox = raster(['#'], 2, 0)
    expect(validateRasterPair(lShape, dotInsideBoundingBox, 0)).toBeNull()
  })

  it('respeita exatamente a folga em pixels sem duplicar a distância', () => {
    const a = raster(['#'], 0, 0)
    const exactThreePixelGap = raster(['#'], 4, 0)
    const onlyTwoPixelGap = raster(['#'], 3, 0)
    expect(pixelSquareDistancePx(0, 0, 4, 0)).toBe(3)
    expect(validateRasterPair(a, exactThreePixelGap, 3)).toBeNull()
    expect(validateRasterPair(a, onlyTwoPixelGap, 3)).toBe('insufficient-gap')
  })

  it('mede a folga em diagonal pela distância euclidiana entre pixels impressos', () => {
    const a = raster(['#'], 0, 0)
    const farDiagonal = raster(['#'], 4, 4)
    const nearDiagonal = raster(['#'], 3, 3)
    expect(validateRasterPair(a, farDiagonal, 4)).toBeNull()
    expect(validateRasterPair(a, nearDiagonal, 3)).toBe('insufficient-gap')
  })

  it('detecta sobreposição real de pixels impressos', () => {
    const a = raster(['##'], 0, 0)
    const b = raster(['##'], 1, 0)
    expect(validateRasterPair(a, b, 0.3)).toBe('overlap')
  })
})
