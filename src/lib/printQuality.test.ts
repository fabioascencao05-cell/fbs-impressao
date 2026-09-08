import { describe, expect, it } from 'vitest'
import { defaultPrintWidthCm, effectivePrintDpi, isPrintReadyDpi, minimumEffectivePrintDpi } from './printQuality'

describe('qualidade de impressão', () => {
  it('não amplia silenciosamente a arte ao sugerir o tamanho de 300 DPI', () => {
    const widthCm = defaultPrintWidthCm(1_000)
    expect(widthCm).toBe(8.4)
    expect(effectivePrintDpi(1_000, widthCm)).toBeGreaterThanOrEqual(300)
  })

  it('só classifica como pronta quando a fonte realmente alcança 300 DPI', () => {
    expect(isPrintReadyDpi(299)).toBe(false)
    expect(isPrintReadyDpi(300)).toBe(true)
    expect(isPrintReadyDpi(250)).toBe(false)
  })

  it('usa a instância mais ampliada da folha para informar a qualidade', () => {
    expect(minimumEffectivePrintDpi(1_000, [8.4, 16.8])).toBeCloseTo(151.19, 2)
  })
})
