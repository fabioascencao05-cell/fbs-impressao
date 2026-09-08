import { describe, expect, it } from 'vitest'
import { planExport, proportionatePatch } from './exportPlan'
import type { PlacedItem } from '@/types'

const art: PlacedItem = { id: 'a', sourceImageId: 'a', previewUrl: 'blob:a', xCm: 0, yCm: 0,
  widthCm: 10, heightCm: 5, angle: 0, contentXPx: 0, contentYPx: 0,
  contentWidthPx: 2400, contentHeightPx: 1200, naturalWidthPx: 2400, naturalHeightPx: 1200 }
const page = (item = art) => ({ index: 0, usedHeightCm: item.heightCm, items: [item] })

describe('resolution and proportion protection', () => {
  it('retains high-resolution source pixels at the chosen print size', () => {
    const plan = planExport(page(), 20, 10)
    expect(plan.pxPerCm * art.widthCm).toBeGreaterThanOrEqual(2400)
    expect(plan.dpi).toBeGreaterThan(600)
  })
  it('uses at least 300 DPI for a low-resolution original without claiming new detail', () => {
    expect(planExport(page({ ...art, contentWidthPx: 200, contentHeightPx: 100 }), 20, 10).dpi).toBeGreaterThanOrEqual(300)
  })
  it('blocks excessive resolution instead of downsampling', () => {
    expect(() => planExport(page(), 570, 100)).toThrow('Nenhuma qualidade foi reduzida')
  })
  it('blocks a deformed or invalid export', () => {
    expect(() => planExport(page({ ...art, heightCm: 7 }), 20, 10)).toThrow('proporção')
    expect(() => planExport(page({ ...art, widthCm: NaN }), 20, 10)).toThrow('inválidas')
  })
  it('locks proportions and protects original source fields during edits', () => {
    const next = proportionatePatch(art, { widthCm: 8, heightCm: 99, contentWidthPx: 1 })
    expect(next.widthCm).toBe(8)
    expect(next.heightCm).toBe(4)
    expect(next.contentWidthPx).toBe(2400)
    expect(proportionatePatch(art, { widthCm: -1 })).toEqual(art)
    expect(proportionatePatch(art, { heightCm: 10 }).widthCm).toBe(20)
  })
  it('rotation does not reduce resolution or change the print size', () => {
    expect(planExport(page({ ...art, angle: 90 }), 20, 20).pxPerCm).toBe(planExport(page(), 20, 20).pxPerCm)
  })
})
