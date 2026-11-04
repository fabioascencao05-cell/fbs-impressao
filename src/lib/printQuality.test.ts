import { describe, expect, it } from 'vitest'
import { defaultPrintWidthCm, effectivePrintDpi, isPrintReadyDpi, minimumEffectivePrintDpi } from './printQuality'

describe('qualidade de impressão', () => {
  it('preserva a medida exata a 300 DPI sem arredondar a arte para baixo', () => {
    const widthCm = defaultPrintWidthCm(1_000)
    expect(widthCm).toBeCloseTo(8.4666666667, 9)
    expect(effectivePrintDpi(1_000, widthCm)).toBeCloseTo(300, 9)
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
