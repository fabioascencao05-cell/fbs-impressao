import { describe, expect, it } from 'vitest'
import ImageTracer from 'imagetracerjs'
import { getEnhanceDimensions } from './enhanceImage'
import { finalizeSvg, getTracePlan, getVectorizeOptions } from './vectorize'

describe('preparo de arte para DTF', () => {
  it('mantém a proporção no plano de vetorização', () => {
    const plan = getTracePlan(1_200, 800, 'high')

    expect(plan.traceWidth / plan.traceHeight).toBeCloseTo(1.5, 2)
    expect(plan.coordinateScale * plan.traceWidth).toBeCloseTo(1_200, 6)
    expect(plan.coordinateScale).toBeGreaterThan(0)
  })

  it('gera um SVG que não estica a arte nem deixa o traço automático', () => {
    const traced = '<svg width="20" height="10"><path fill="rgb(0,0,0)" stroke="rgb(0,0,0)" stroke-width="0" opacity="0" d="M 0 0" /><path fill="rgb(255,0,0)" stroke="rgb(255,0,0)" stroke-width="0" opacity="1" d="M 1 1" /></svg>'
    const svg = finalizeSvg(traced, 600, 400)

    expect(svg).toContain('viewBox="0 0 600 400"')
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(svg).toContain('opacity="1"')
    expect(svg).not.toContain('opacity="0"')
    expect(svg).not.toContain('stroke=')
    expect(svg).not.toContain('stroke-width=')
  })

  it('usa vetor fiel sem contorno extra por padrão', () => {
    const options = getVectorizeOptions('logo', 'high', 0.5)

    expect(options.strokewidth).toBe(0)
    expect(options.numberofcolors).toBe(32)
    expect(options.scale).toBe(0.5)
    expect(options.viewbox).toBe(true)
  })

  it('limpa de verdade o contorno e a camada transparente criados pelo traçador', () => {
    const pixels = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        255, 0, 0, 255, 0, 0, 0, 0,
        0, 0, 0, 0, 255, 0, 0, 255,
      ]),
    } as ImageData
    const raw = ImageTracer.imagedataToSVG(pixels, getVectorizeOptions('logo', 'high'))
    const svg = finalizeSvg(raw, 2, 2)

    expect(svg).toContain('fill="rgb(255,0,0)"')
    expect(svg).not.toContain('opacity="0"')
    expect(svg).not.toContain('stroke=')
  })

  it('limita um upscale grande sem alterar a proporção', () => {
    const target = getEnhanceDimensions(3_000, 2_000, 6)

    expect(target.capped).toBe(true)
    expect(target.width / target.height).toBeCloseTo(1.5, 2)
    expect(target.width * target.height).toBeLessThanOrEqual(48_000_000)
  })
})
