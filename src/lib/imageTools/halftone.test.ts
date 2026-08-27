import { describe, expect, it } from 'vitest'
import { MAX_HALFTONE_SVG_DOTS, canExportHalftoneSvg, cmykFromRgb, getHalftoneDimensions, getMinimumHalftoneSpacing } from './halftone'

describe('halftone para DTF', () => {
  it('converte preto e branco corretamente para CMYK', () => {
    expect(cmykFromRgb(0, 0, 0)).toEqual({ c: 0, m: 0, y: 0, k: 1 })
    expect(cmykFromRgb(255, 255, 255)).toEqual({ c: 0, m: 0, y: 0, k: 0 })
  })

  it('mantém a proporção quando precisa limitar um arquivo muito grande', () => {
    const dimensions = getHalftoneDimensions(18_000, 9_000)

    expect(dimensions.capped).toBe(true)
    expect(dimensions.width / dimensions.height).toBeCloseTo(2, 2)
    expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(48_000_000)
  })

  it('libera SVG somente para halftone de uma cor em tamanho editável', () => {
    expect(canExportHalftoneSvg('mono', 320)).toBe(true)
    expect(canExportHalftoneSvg('cmyk', 320)).toBe(false)
    expect(canExportHalftoneSvg('mono', MAX_HALFTONE_SVG_DOTS + 1)).toBe(false)
  })

  it('exige um espaçamento seguro para telas muito grandes', () => {
    expect(getMinimumHalftoneSpacing(600, 400)).toBe(4)
    expect(getMinimumHalftoneSpacing(12_000, 8_000)).toBeGreaterThan(4)
  })
})
