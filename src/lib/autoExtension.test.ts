import { describe, expect, it } from 'vitest'
import type { GangImage } from '@/types'
import { optimizeLayout } from './optimizeLayout'
import { calculateConsumption } from './consumption'
import { planUsefulExport } from './exportPlan'
import { packImages } from './binPacking'
import { validateLayout } from './layoutValidation'
import { packingHeightLimitCm, pageWorkspaceHeightCm } from './sheetDimensions'

function image(id: string, widthCm: number, heightCm: number, quantity = 1): GangImage {
  const contentWidthPx = Math.round(widthCm * 10), contentHeightPx = Math.round(heightCm * 10)
  return { id, file: new File([], `${id}.png`), previewUrl: `blob:${id}`,
    naturalWidthPx: contentWidthPx, naturalHeightPx: contentHeightPx, aspectRatio: heightCm / widthCm,
    quantity, widthCm, heightCm, contentXPx: 0, contentYPx: 0, contentWidthPx, contentHeightPx }
}

describe('extensão automática de até 15 cm', () => {
  it('encaixa uma arte de 108 cm sem reduzir nem cortar, mantendo o pedido em 100 cm', () => {
    const images = [image('comprida', 57, 108)]
    const original = structuredClone(images)
    const result = optimizeLayout(images, 100, 57, .3)
    expect(result.unplaced).toEqual([])
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].items[0]).toMatchObject({ widthCm: 57, heightCm: 108 })
    expect(pageWorkspaceHeightCm(result.pages[0], 100)).toBeCloseTo(108.1)
    const exportPlan = planUsefulExport(result.pages[0], 57, 100)
    expect(exportPlan.heightPx / exportPlan.pxPerCm).toBeCloseTo(108.1, 1)
    expect(validateLayout(result.pages, 57, packingHeightLimitCm(100), .3)).toEqual([])
    expect(images).toEqual(original)
  })

  it('usa a extensão quando juntar duas folhas reduz a metragem total', () => {
    const images = [image('grande', 30, 80), image('menor', 25, 57.3, 2)]
    const baseline = packImages(images, 100, 57, .3)
    expect(baseline.pages).toHaveLength(2)
    const result = optimizeLayout(images, 100, 57, .3)
    expect(result.unplaced).toEqual([])
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].items).toHaveLength(3)
    expect(result.pages[0].usedHeightCm).toBeLessThanOrEqual(packingHeightLimitCm(100) + 1e-6)
    expect(calculateConsumption(result.pages, 57, 55).lengthCm).toBeLessThan(calculateConsumption(baseline.pages, 57, 55).lengthCm)
    expect(validateLayout(result.pages, 57, packingHeightLimitCm(100), .3)).toEqual([])
  }, 15000)

  it('não estende só para juntar arquivos se isso gastar mais filme', () => {
    const images = [image('faixas', 10, 51, 3)]
    const result = optimizeLayout(images, 100, 20.3, .3)
    expect(result.pages).toHaveLength(2)
    expect(result.pages.every(page => page.usedHeightCm <= 100)).toBe(true)
    expect(calculateConsumption(result.pages, 20.3, 55).lengthCm).toBeCloseTo(102.2)
  })

  it('mantém como não encaixada uma arte que excede o limite autorizado', () => {
    const result = optimizeLayout([image('demais', 57, 116)], 100, 57, .3)
    expect(result.pages).toEqual([])
    expect(result.unplaced).toHaveLength(1)
  })

  it('não preenche os 15 cm se uma única folha já comporta o trabalho', () => {
    const result = optimizeLayout([image('curta', 57, 10)], 100, 57, .3)
    expect(result.pages[0].usedHeightCm).toBeCloseTo(10)
    expect(pageWorkspaceHeightCm(result.pages[0], 100)).toBe(100)
    expect(calculateConsumption(result.pages, 57, 55).lengthCm).toBeCloseTo(10.1)
  })

  it('não amplia uma folha manual sem extensão escolhida pelo otimizador', () => {
    const art = { ...image('manual', 10, 10), sourceImageId: 'manual', xCm: 0, yCm: 0, angle: 0 }
    expect(pageWorkspaceHeightCm({ index: 0, items: [art], usedHeightCm: 10 }, 9)).toBe(9)
    expect(pageWorkspaceHeightCm({ index: 0, items: [art], usedHeightCm: 10, autoExtended: true }, 9)).toBeCloseTo(10.1)
  })
})
