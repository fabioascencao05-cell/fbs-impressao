import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGangSheetStore } from './useGangSheetStore'
import { calculateConsumption } from '@/lib/consumption'
import type { GangImage, PlacedItem } from '@/types'

function sourceImage(id: string): GangImage {
  return {
    id,
    file: new File(['art'], `${id}.png`, { type: 'image/png' }),
    previewUrl: `blob:${id}`,
    naturalWidthPx: 1_000,
    naturalHeightPx: 1_000,
    aspectRatio: 1,
    quantity: 1,
    widthCm: 10,
    heightCm: 10,
    contentXPx: 0,
    contentYPx: 0,
    contentWidthPx: 1_000,
    contentHeightPx: 1_000,
  }
}

function placed(id: string, sourceImageId: string, yCm: number): PlacedItem {
  return {
    id,
    sourceImageId,
    previewUrl: `blob:${sourceImageId}`,
    xCm: 0,
    yCm,
    widthCm: 10,
    heightCm: 10,
    angle: 0,
    contentXPx: 0,
    contentYPx: 0,
    contentWidthPx: 1_000,
    contentHeightPx: 1_000,
    naturalWidthPx: 1_000,
    naturalHeightPx: 1_000,
  }
}

describe('validade do layout DTF', () => {
  afterEach(() => useGangSheetStore.getState().cancelPacking())
  beforeEach(() => {
    useGangSheetStore.setState({ images: [], pages: [], unplacedImages: [], packingStrategy: null })
  })

  it('descarta o layout antigo quando a medida de uma arte muda', () => {
    const art = sourceImage('art')
    useGangSheetStore.setState({
      images: [art],
      pages: [{ index: 0, items: [placed('art-0', art.id, 0)], usedHeightCm: 10 }],
      packingStrategy: 'area/short-side',
    })

    useGangSheetStore.getState().updateWidthCm(art.id, 15)

    expect(useGangSheetStore.getState().pages).toEqual([])
    expect(useGangSheetStore.getState().packingStrategy).toBeNull()
  })

  it.each([
    ['quantidade', () => useGangSheetStore.getState().updateQuantity('art', 2)],
    ['largura da folha', () => useGangSheetStore.getState().setCanvasWidthCm(56)],
    ['altura insuficiente da página', () => useGangSheetStore.getState().setMaxHeightCm(5)],
    ['espaçamento', () => useGangSheetStore.getState().setItemGapCm(0.5)],
  ])('descarta o layout antigo quando muda %s', (_label, change) => {
    const art = sourceImage('art')
    useGangSheetStore.setState({
      images: [art],
      pages: [{ index: 0, items: [placed('art-0', art.id, 0)], usedHeightCm: 10 }],
      packingStrategy: 'area/short-side',
    })

    change()

    expect(useGangSheetStore.getState().pages).toEqual([])
    expect(useGangSheetStore.getState().packingStrategy).toBeNull()
  })

  it('reduz a altura usada quando a arte mais baixa é removida', () => {
    const first = sourceImage('first')
    const last = sourceImage('last')
    useGangSheetStore.setState({
      images: [first, last],
      pages: [{ index: 0, items: [placed('first-0', first.id, 0), placed('last-0', last.id, 20)], usedHeightCm: 30 }],
    })

    useGangSheetStore.getState().removeImage(last.id)

    expect(useGangSheetStore.getState().pages[0].usedHeightCm).toBe(10)
  })

  it('alterar o corte do fim do filme não reempacota nem muda artes ajustadas', () => {
    const pages = [{ index: 0, items: [placed('manual', 'art', 30)], usedHeightCm: 40 }]
    useGangSheetStore.setState({ pages, trimExportHeight: false })
    useGangSheetStore.getState().setTrimExportHeight(true)
    expect(useGangSheetStore.getState().pages).toBe(pages)
    expect(useGangSheetStore.getState().trimExportHeight).toBe(true)
  })
})

// Worker lifecycle matters: an old optimization must never overwrite manual
// edits or a newer upload/measurement, and cancellation retains the old layout.

class FakeWorker {
  static latest: FakeWorker
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false
  input: { images: Array<{ file?: File }> } | null = null
  constructor() { FakeWorker.latest = this }
  postMessage(input: typeof this.input) { this.input = input }
  terminate() { this.terminated = true }
  emit(data: unknown) { this.onmessage?.({ data } as MessageEvent) }
}

describe('otimização em segundo plano', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', FakeWorker)
    useGangSheetStore.setState({ images: [sourceImage('art')],
      pages: [{ index: 0, items: [placed('manual', 'art', 20)], usedHeightCm: 30 }], packingProgress: null })
  })
  afterEach(() => { useGangSheetStore.getState().cancelPacking(); vi.unstubAllGlobals() })

  it('mantém a montagem enquanto busca e substitui somente após terminar', async () => {
    const oldPages = useGangSheetStore.getState().pages
    const task = useGangSheetStore.getState().generateLayout(), worker = FakeWorker.latest
    expect(useGangSheetStore.getState().pages).toBe(oldPages)
    expect(worker.input?.images[0].file).toBeUndefined()
    worker.emit({ type: 'progress', done: 1, total: 3 })
    expect(useGangSheetStore.getState().packingProgress).toEqual({ done: 1, total: 3 })
    const pages = [{ index: 0, items: [placed('art-0', 'art', 0)], usedHeightCm: 10 }]
    worker.emit({ type: 'result', result: { pages, unplaced: [], strategy: 'contornos/rotacao-livre' } })
    expect(await task).toBe(true)
    expect(useGangSheetStore.getState().pages).toBe(pages)
    expect(useGangSheetStore.getState().packingProgress).toBeNull()
    expect(worker.terminated).toBe(true)
  })

  it('cancelar preserva ajustes e ignora uma resposta tardia', async () => {
    const oldPages = useGangSheetStore.getState().pages
    const task = useGangSheetStore.getState().generateLayout(), worker = FakeWorker.latest
    useGangSheetStore.getState().cancelPacking()
    worker.emit({ type: 'result', result: { pages: [], unplaced: [], strategy: 'antigo' } })
    expect(await task).toBe(false)
    expect(worker.terminated).toBe(true)
    expect(useGangSheetStore.getState().pages).toBe(oldPages)
    expect(useGangSheetStore.getState().packingProgress).toBeNull()
  })

  it('uma alteração de medida cancela a busca antes que ela possa restaurar um layout antigo', async () => {
    const task = useGangSheetStore.getState().generateLayout(), worker = FakeWorker.latest
    useGangSheetStore.getState().updateWidthCm('art', 15)
    worker.emit({ type: 'result', result: { pages: [{ index: 0, items: [placed('art-0', 'art', 0)], usedHeightCm: 10 }], unplaced: [], strategy: 'antigo' } })
    expect(await task).toBe(false)
    expect(useGangSheetStore.getState().pages).toEqual([])
    expect(useGangSheetStore.getState().images[0].widthCm).toBe(15)
  })

  it('uma falha no worker libera os controles e mantém a montagem atual', async () => {
    const oldPages = useGangSheetStore.getState().pages
    const task = useGangSheetStore.getState().generateLayout(), worker = FakeWorker.latest
    const assertion = expect(task).rejects.toThrow('Falha de teste')
    worker.emit({ type: 'error', message: 'Falha de teste' })
    await assertion
    expect(useGangSheetStore.getState().pages).toBe(oldPages)
    expect(useGangSheetStore.getState().packingProgress).toBeNull()
    expect(worker.terminated).toBe(true)
  })
})


describe('recálculo automático do consumo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('Worker', FakeWorker)
    useGangSheetStore.setState({ images: [sourceImage('art')], pages: [], maxHeightCm: 200,
      canvasWidthCm: 57, costPerMeter: 55, packingProgress: null, unplacedImages: [] })
  })
  afterEach(() => { useGangSheetStore.getState().cancelPacking(); vi.useRealTimers(); vi.unstubAllGlobals() })
  const totals = () => {
    const s = useGangSheetStore.getState()
    return calculateConsumption(s.pages, s.canvasWidthCm, s.costPerMeter)
  }

  it('aumentar só o canvas de 200 para 500 cm mantém posições e custo de R$ 40,70', () => {
    const pages = [{ index: 0, usedHeightCm: 73.9, items: [placed('art-0', 'art', 63.9)] }]
    useGangSheetStore.setState({ pages })
    expect(totals().cost).toBeCloseTo(40.7)
    useGangSheetStore.getState().setMaxHeightCm(500)
    expect(useGangSheetStore.getState().pages).toBe(pages)
    expect(totals().cost).toBeCloseTo(40.7)
    useGangSheetStore.getState().setTrimExportHeight(true)
    expect(totals().cost).toBeCloseTo(40.7)
    useGangSheetStore.getState().setTrimExportHeight(false)
    expect(totals().cost).toBeCloseTo(40.7)
  })

  it('quantidade e medida só iniciam uma busca quando o usuário solicita', async () => {
    const createWorker = vi.fn(function () { return new FakeWorker() })
    vi.stubGlobal('Worker', createWorker)
    useGangSheetStore.getState().updateQuantity('art', 3)
    useGangSheetStore.getState().updateWidthCm('art', 20)
    vi.advanceTimersByTime(5000)
    expect(createWorker).not.toHaveBeenCalled()
    expect(useGangSheetStore.getState().packingProgress).toBeNull()
    const task = useGangSheetStore.getState().generateLayout()
    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(FakeWorker.latest.input?.images[0]).toMatchObject({ quantity: 3, widthCm: 20, heightCm: 20 })
    const items = [0, 20.3, 40.6].map((y, i) => ({ ...placed(`art-${i}`, 'art', y), widthCm: 20, heightCm: 20 }))
    FakeWorker.latest.emit({ type: 'result', result: { pages: [{ index: 0, items, usedHeightCm: 60.6 }], unplaced: [], strategy: 'teste' } })
    expect(await task).toBe(true)
    expect(totals().units).toBe(3)
    expect(totals().imageAreaCm2).toBe(1200)
    expect(totals().lengthCm).toBeCloseTo(60.7)
  })

  it('mover, redimensionar, girar, duplicar e remover recalcula a montagem atual', () => {
    useGangSheetStore.setState({ pages: [{ index: 0, items: [placed('art-0', 'art', 0)], usedHeightCm: 10 }] })
    const store = useGangSheetStore.getState()
    store.updatePlacedItem(0, 'art-0', { yCm: 20, widthCm: 15, angle: 45 })
    expect(totals().lengthCm).toBeCloseTo(20 + 15 * Math.SQRT2 + 0.1)
    expect(totals().imageAreaCm2).toBe(225)
    store.duplicatePlacedItem(0, 'art-0')
    expect(totals().units).toBe(2)
    expect(totals().imageAreaCm2).toBe(450)
    store.removePlacedItem(0, 'art-0')
    expect(totals().units).toBe(1)
    store.removePage(0)
    expect(totals().cost).toBe(0)
  })

  it('configurar folha e espaçamento nunca inicia uma busca sem o clique', () => {
    useGangSheetStore.getState().updateQuantity('art', 2)
    useGangSheetStore.getState().setItemGapCm(0.2)
    useGangSheetStore.getState().setCanvasWidthCm(57)
    useGangSheetStore.getState().setMaxHeightCm(300)
    vi.advanceTimersByTime(5000)
    expect(useGangSheetStore.getState().pages).toEqual([])
    expect(useGangSheetStore.getState().packingProgress).toBeNull()
  })
})
