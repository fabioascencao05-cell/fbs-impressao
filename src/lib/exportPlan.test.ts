import { describe, expect, it } from 'vitest'
import { planExport, planUsefulExport, proportionatePatch, sheetHeightCm } from './exportPlan'
import type { PlacedItem } from '@/types'

const art: PlacedItem = { id: 'a', sourceImageId: 'a', previewUrl: 'blob:a', xCm: 0, yCm: 0,
  widthCm: 10, heightCm: 5, angle: 0, contentXPx: 0, contentYPx: 0,
  contentWidthPx: 2400, contentHeightPx: 1200, naturalWidthPx: 2400, naturalHeightPx: 1200 }
const page = (item = art) => ({ index: 0, usedHeightCm: item.heightCm, items: [item] })

describe('resolution and proportion protection', () => {
  it('preserves a high-resolution original instead of reducing it to 300 DPI', () => {
    const plan = planExport(page(), 20, 10)
    expect(plan.dpi).toBe(610)
    expect(plan.pxPerCm * art.widthCm).toBeGreaterThanOrEqual(art.contentWidthPx)
    expect(plan.pxPerCm * art.heightCm).toBeGreaterThanOrEqual(art.contentHeightPx)
  })
  it('uses at least 300 DPI for a low-resolution original without claiming new detail', () => {
    expect(planExport(page({ ...art, contentWidthPx: 200, contentHeightPx: 100 }), 20, 10).dpi).toBeGreaterThanOrEqual(300)
  })
  it('rejects excessive physical dimensions without silently splitting', () => {
    expect(() => planExport(page(), 570, 100)).toThrow('não divide artes')
  })
  it('supports a continuous 57 cm by 3 metre sheet independently of source density', () => {
    const plan = planExport(page({ ...art, contentWidthPx: 200, contentHeightPx: 100 }), 57, 300)
    expect(plan.dpi).toBe(300)
    expect(plan.widthPx).toBe(6733)
    expect(plan.heightPx).toBe(35434)
  })
  it('uses the requested metre length unless trimming is explicitly selected', () => {
    expect(sheetHeightCm(page(), 100)).toBe(100)
    expect(sheetHeightCm(page(), 100, true)).toBe(5.1)
    const rotated = page({ ...art, angle: 90, yCm: 20 })
    expect(sheetHeightCm(rotated, 100, true)).toBe(30.1)
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
  it('removes all outer empty canvas while retaining the relative composition and cutting margin', () => {
    const placed = { ...art, xCm: 7, yCm: 30, angle: 90 }
    const composition = page(placed)
    const before = structuredClone(composition)
    const plan = planUsefulExport(composition, 57, 200)
    expect(plan.widthPx / plan.pxPerCm).toBeCloseTo(5, 1)
    expect(plan.heightPx / plan.pxPerCm).toBeCloseTo(10.1, 1)
    expect(plan.offsetXPx).toBeGreaterThan(0)
    expect(plan.offsetYPx).toBeGreaterThan(0)
    expect(planUsefulExport(composition, 570, 2000)).toEqual(plan)
    expect(composition).toEqual(before)
  })
  it('keeps the most detailed copy after resizing and mixing different source resolutions', () => {
    const large = { ...art, id: 'large', widthCm: 5, heightCm: 2.5, xCm: 12 }
    const plan = planUsefulExport({ index: 0, usedHeightCm: 5, items: [art, large] }, 57, 200)
    expect(plan.dpi).toBe(1220)
    for (const item of [art, large]) {
      expect(item.widthCm * plan.pxPerCm).toBeGreaterThanOrEqual(item.contentWidthPx)
      expect(item.heightCm * plan.pxPerCm).toBeGreaterThanOrEqual(item.contentHeightPx)
    }
    expect(plan.widthPx / plan.pxPerCm).toBeCloseTo(17, 1)
  })
  it('uses the native useful area even when the reserved canvas would exceed the pixel limit', () => {
    const detailed = { ...art, widthCm: 1, heightCm: 0.5 }
    expect(() => planExport(page(detailed), 57, 200)).toThrow('nem reduz a resolução')
    const plan = planUsefulExport(page(detailed), 57, 200)
    expect(plan.dpi).toBe(6096)
    expect(plan.widthPx).toBe(2401)
    expect(plan.heightPx).toBe(1440)
  })
  it('keeps the final cutting margin even when art touches the last canvas row', () => {
    const plan = planUsefulExport(page(), 57, 5)
    expect(plan.heightPx / plan.pxPerCm).toBeCloseTo(5.1, 1)
  })
})
