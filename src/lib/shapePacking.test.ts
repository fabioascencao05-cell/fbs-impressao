import { describe, expect, it } from 'vitest'
import { packImages } from './binPacking'
import { packImagesByShape } from './shapePacking'
import { CELL_CM, forEachCell, shapeFor } from './shapeMask'
import { validateLayout } from './layoutValidation'
import { rotatedAabbCm } from './geometry'
import type { GangImage, OccupancyMask } from '@/types'

function image(id: string, widthCm: number, heightCm: number, quantity = 1, occupancyMask?: OccupancyMask): GangImage {
  const widthPx = Math.round(widthCm * 100), heightPx = Math.round(heightCm * 100)
  return { id, file: new File([''], `${id}.png`), previewUrl: `blob:${id}`, naturalWidthPx: widthPx, naturalHeightPx: heightPx,
    aspectRatio: heightCm / widthCm, quantity, widthCm, heightCm, occupancyMask,
    contentXPx: 0, contentYPx: 0, contentWidthPx: widthPx, contentHeightPx: heightPx }
}
function triangle(): OccupancyMask {
  const cols = 40, rows = 40, data = new Uint8Array(cols * rows)
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (x + y < cols) data[y * cols + x] = 1
  return { cols, rows, data }
}

it('encaixa uma peça indivisível na diagonal que 0°/90° rejeitam', () => {
  const images = [image('faixa', 10, 1)]
  const baseline = packImages(images, 8, 8, 0.3)
  expect(baseline.unplaced).toHaveLength(1)
  const result = packImagesByShape(images, baseline, 8, 8, 0.3)
  expect(result.unplaced).toEqual([])
  expect(result.pages).toHaveLength(1)
  const art = result.pages[0].items[0]
  expect(art.angle % 90).not.toBe(0)
  expect([art.widthCm, art.heightCm]).toEqual([10, 1])
  expect(validateLayout(result.pages, 8, 8, 0.3)).toEqual([])
})

it('usa os vãos externos entre triângulos com distância de corte', () => {
  const images = [image('triangulo', 4, 4, 2, triangle())]
  const baseline = packImages(images, 10, 5, 0.3)
  const result = packImagesByShape(images, baseline, 5, 10, 0.3)
  expect(result.pages.flatMap(page => page.items)).toHaveLength(2)
  expect(result.pages[0].usedHeightCm).toBeLessThan(6)
  expect(result.pages[0].usedHeightCm).toBeLessThan(baseline.pages[0].usedHeightCm)
  expect(validateLayout(result.pages, 5, 10, 0.3)).toEqual([])
  const [a, b] = result.pages[0].items
  expect(Math.abs(a.yCm - b.yCm)).toBeLessThan(4)
  const shifted = { ...b, xCm: a.xCm, yCm: a.yCm, angle: a.angle }
  expect(validateLayout([{ ...result.pages[0], items: [a, shifted] }], 5, 10, 0.3).some(i => i.type === 'overlap')).toBe(true)
})

it('não piora o resultado, perde cópias nem altera dimensões em uma fila mista', () => {
  const images = [image('triangle', 4, 4, 4, triangle()), image('retangulo', 2, 3, 4)]
  const baseline = packImages(images, 15, 10, 0.3)
  const result = packImagesByShape(images, baseline, 10, 15, 0.3)
  expect(result.pages.flatMap(page => page.items)).toHaveLength(8)
  expect(result.unplaced).toEqual([])
  expect(result.pages.length).toBeLessThanOrEqual(baseline.pages.length)
  if (result.pages.length === baseline.pages.length) expect(result.pages.reduce((s, p) => s + p.usedHeightCm, 0)).toBeLessThanOrEqual(baseline.pages.reduce((s, p) => s + p.usedHeightCm, 0))
  expect(validateLayout(result.pages, 10, 15, 0.3)).toEqual([])
  for (const art of result.pages.flatMap(page => page.items)) {
    const source = images.find(i => i.id === art.sourceImageId)!
    expect([art.widthCm, art.heightCm, art.previewUrl]).toEqual([source.widthCm, source.heightCm, source.previewUrl])
  }
})

it('mantém uma arte realmente grande como não encaixada', () => {
  const images = [image('grande', 20, 20, 2)]
  const result = packImagesByShape(images, packImages(images, 10, 10, 0.3), 10, 10, 0.3)
  expect(result.unplaced).toHaveLength(2)
  expect(result.pages).toEqual([])
})

describe('rasterização conservadora em rotação livre', () => {
  it.each([0, 17, 37.25, 90, 113, 180, 270, 359.5])('não apaga nenhum ponto de tinta em %s°', angle => {
    const mask = triangle(), width = 4.13, height = 3.77
    const shape = shapeFor(mask, width, height, angle), cells = new Set<string>()
    forEachCell(shape, (x, y) => { cells.add(`${x}/${y}`) })
    const box = rotatedAabbCm(width, height, angle), rad = angle * Math.PI / 180
    for (let sy = 0; sy < mask.rows; sy++) for (let sx = 0; sx < mask.cols; sx++) {
      if (!mask.data[sy * mask.cols + sx]) continue
      for (const dx of [0.001, 0.5, 0.999]) for (const dy of [0.001, 0.5, 0.999]) {
        const x = (sx + dx) / mask.cols * width - width / 2, y = (sy + dy) / mask.rows * height - height / 2
        const gx = Math.floor((x * Math.cos(rad) - y * Math.sin(rad) + box.wCm / 2) / CELL_CM)
        const gy = Math.floor((x * Math.sin(rad) + y * Math.cos(rad) + box.hCm / 2) / CELL_CM)
        expect(cells.has(`${gx}/${gy}`)).toBe(true)
      }
    }
  })
  it('usa o polígono rotacionado também para uma imagem opaca', () => {
    const shape = shapeFor(undefined, 10, 1, 45)
    let count = 0
    forEachCell(shape, () => { count++ })
    expect(count).toBeLessThan(shape.cols * shape.rows / 3)
  })
})

it('calcula um ângulo viável quando nem os giros de 15° cabem', () => {
  const images = [image('estreita', 10, 1)]
  const result = packImagesByShape(images, packImages(images, 8.1, 7.6, 0.3), 7.6, 8.1, 0.3)
  expect(result.unplaced).toEqual([])
  const art = result.pages[0].items[0]
  expect(art.angle % 15).not.toBe(0)
  expect(validateLayout(result.pages, 7.6, 8.1, 0.3)).toEqual([])
  expect([art.widthCm, art.heightCm]).toEqual([10, 1])
})

it('conclui o encaixe de 30 contornos antes de esgotar a busca angular', () => {
  const images = [image('triangulo', 12, 12, 30, triangle())]
  const baseline = packImages(images, 100, 57, 0.3)
  const result = packImagesByShape(images, baseline, 57, 100, 0.3)
  expect(result.pages).toHaveLength(1)
  expect(result.pages[0].items).toHaveLength(30)
  expect(result.pages[0].usedHeightCm).toBeLessThan(80)
  expect(validateLayout(result.pages, 57, 100, 0.3)).toEqual([])
}, 10000)
