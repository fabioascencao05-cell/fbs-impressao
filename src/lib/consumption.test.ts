import { describe, expect, it } from 'vitest'
import { calculateConsumption, requestedImageTotals } from './consumption'
import { packImages } from './binPacking'
import type { GangImage, PackedPage, PlacedItem } from '@/types'

const item = (patch: Partial<PlacedItem> = {}): PlacedItem => ({
  id: 'art-0', sourceImageId: 'art', previewUrl: 'blob:art',
  widthCm: 20, heightCm: 10, xCm: 0, yCm: 0, angle: 0,
  contentXPx: 0, contentYPx: 0, contentWidthPx: 2000, contentHeightPx: 1000,
  naturalWidthPx: 2000, naturalHeightPx: 1000, ...patch,
})
const page = (items: PlacedItem[], index = 0): PackedPage => ({ index, items, usedHeightCm: 999 })

describe('consumo físico de DTF', () => {
  it('cobra R$ 40,70 por 74 cm incluindo margem técnica, sem usar altura em cache', () => {
    const result = calculateConsumption([page([item({ heightCm: 73.9 })])], 57, 55)
    expect(result.lengthCm).toBeCloseTo(74)
    expect(result.lengthMeters).toBeCloseTo(0.74)
    expect(result.cost).toBeCloseTo(40.70)
    expect(result.filmAreaCm2).toBeCloseTo(57 * 74)
  })
  it('ignora a faixa inicial recortada, conserva espaços internos e uma margem final', () => {
    const result = calculateConsumption([page([item({ yCm: 0.5 }), item({ yCm: 10.8 })])], 57, 55)
    expect(result.lengthCm).toBeCloseTo(20.4)
    expect(result.imageAreaCm2).toBe(400)
    expect(result.wasteAreaCm2).toBeCloseTo(57 * 20.4 - 400)
  })
  it('transladar a montagem inteira sobre espaço vazio não aumenta a cobrança do PNG útil', () => {
    const items = [item(), item({ id: 'art-1', yCm: 10.3 })]
    const initial = calculateConsumption([page(items)], 57, 55)
    const moved = calculateConsumption([page(items.map(item => ({ ...item, xCm: item.xCm + 15, yCm: item.yCm + 70 })))], 57, 55)
    expect(moved.lengthCm).toBeCloseTo(initial.lengthCm)
    expect(moved.cost).toBeCloseTo(initial.cost)
  })
  it.each([0, 90, 180, 270, 45, 123])('mede a projeção vertical a %s graus sem alterar a área física', angle => {
    const result = calculateConsumption([page([item({ angle })])], 57, 55)
    const radians = angle * Math.PI / 180
    expect(result.lengthCm).toBeCloseTo(20 * Math.abs(Math.sin(radians)) + 10 * Math.abs(Math.cos(radians)) + 0.1)
    expect(result.imageAreaCm2).toBe(200)
  })
  it('soma páginas ocupadas e não cobra margens de páginas vazias', () => {
    const result = calculateConsumption([page([item()]), page([], 1), page([item()], 2)], 57, 55)
    expect(result.units).toBe(2)
    expect(result.lengthCm).toBeCloseTo(20.2)
    expect(calculateConsumption([page([])], 57, 55)).toMatchObject({ cost: 0, lengthCm: 0, efficiency: 0, wasteAreaCm2: 0 })
  })
  it('calcula quantidade e cm² antes e depois de otimizar, sem contar cópias duas vezes', () => {
    const images = [{ ...item(), id: 'art', file: new File([], 'art.png'), quantity: 4, aspectRatio: 0.5 }] as GangImage[]
    expect(requestedImageTotals(images)).toEqual({ units: 4, imageAreaCm2: 800 })
    const result = packImages(images, 200, 57, 0.3)
    expect(calculateConsumption(result.pages, 57, 55)).toMatchObject({ units: 4, imageAreaCm2: 800 })
    // Same real packer, different unused canvas: the bill remains unchanged.
    const taller = packImages(images, 500, 57, 0.3)
    expect(calculateConsumption(taller.pages, 57, 55).cost).toBeCloseTo(calculateConsumption(result.pages, 57, 55).cost)
  })
  it('distingue área física retangular e estimativa pelos contornos', () => {
    const result = calculateConsumption([page([item({ occupancyMask: { cols: 2, rows: 1, data: new Uint8Array([1, 0]) } })])], 57, 55)
    expect(result.imageAreaCm2).toBe(200)
    expect(result.contourAreaCm2).toBe(100)
    expect(result.efficiency).toBeCloseTo(100 / (57 * 10.1) * 100)
    expect(result.cost).toBeCloseTo(10.1 / 100 * 55)
  })
  it('mudar somente o custo por metro recalcula o preço sem alterar a metragem', () => {
    expect(calculateConsumption([page([item()])], 57, 100).cost).toBeCloseTo(10.1)
    expect(calculateConsumption([page([item()])], 57, 0).cost).toBe(0)
  })
})
