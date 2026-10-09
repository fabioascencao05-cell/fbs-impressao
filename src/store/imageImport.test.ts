import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useGangSheetStore } from './useGangSheetStore'
import { requestedImageTotals } from '@/lib/consumption'

// Isolate browser decoding; use real File bytes and the real physical-density
// reader so the import/store conversion is tested independently of the UI.
vi.mock('@/lib/trimImage', () => ({ computeContentBox: vi.fn().mockResolvedValue({
  xPx: 0, yPx: 0, widthPx: 1000, heightPx: 500, naturalWidthPx: 1000, naturalHeightPx: 500,
}) }))
vi.mock('@/lib/shapeMask', () => ({ readOccupancyMask: vi.fn().mockResolvedValue(null) }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('Worker', vi.fn(() => ({ postMessage: vi.fn(), terminate: vi.fn() })))
  useGangSheetStore.getState().reset()
})
afterEach(() => { useGangSheetStore.getState().reset(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('importa a medida física do PNG sem iniciar o encaixe', async () => {
  const data = new ArrayBuffer(29), view = new DataView(data)
  view.setUint32(0, 0x89504e47); view.setUint32(4, 0x0d0a1a0a)
  view.setUint32(8, 9); view.setUint32(12, 0x70485973)
  view.setUint32(16, 10000); view.setUint32(20, 10000); view.setUint8(24, 1)
  await useGangSheetStore.getState().addImages([new File([data], '10x5.png', { type: 'image/png' })])
  const state = useGangSheetStore.getState(), image = state.images[0]
  vi.advanceTimersByTime(1000)
  expect(Worker).not.toHaveBeenCalled()
  expect(state.packingProgress).toBeNull()
  expect(state.pages).toEqual([])
  expect(image.sourceDpi).toBe(254)
  expect(image.widthCm).toBe(10)
  expect(image.heightCm).toBe(5)
  expect(requestedImageTotals(state.images).imageAreaCm2).toBe(50)
  state.updateWidthCm(image.id, 20)
  state.updateQuantity(image.id, 3)
  expect(requestedImageTotals(useGangSheetStore.getState().images)).toEqual({ units: 3, imageAreaCm2: 600 })
  state.removeImage(image.id)
  expect(useGangSheetStore.getState().packingProgress).toBeNull()
  expect(requestedImageTotals(useGangSheetStore.getState().images)).toEqual({ units: 0, imageAreaCm2: 0 })
})

it('sem DPI informado usa a sugestão de 300 DPI; um arquivo recusado não altera a fila', async () => {
  const state = useGangSheetStore.getState()
  await state.addImages([new File(['no metadata'], 'art.webp', { type: 'image/webp' })])
  const images = useGangSheetStore.getState().images
  expect(images[0].sourceDpi).toBeUndefined()
  expect(images[0].widthCm).toBe(8.4)
  expect(await state.addImages([new File(['text'], 'invalid.txt', { type: 'text/plain' })])).toEqual({ added: 0, skipped: 1 })
  expect(useGangSheetStore.getState().images).toBe(images)
})
