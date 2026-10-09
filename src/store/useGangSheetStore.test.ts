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

describe('edição de cópias entre folhas', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', FakeWorker)
    const image = { ...sourceImage('art'), quantity: 2 }
    useGangSheetStore.setState({ images: [image], pages: [
      { index: 0, items: [placed('art-0', 'art', 30)], usedHeightCm: 40 },
      { index: 1, items: [placed('art-1', 'art', 0)], usedHeightCm: 10 },
    ], maxHeightCm: 100, canvasWidthCm: 57, itemGapCm: 0.3, costPerMeter: 55, packingProgress: null })
  })
  afterEach(() => { useGangSheetStore.getState().cancelPacking(); vi.unstubAllGlobals() })

  it('transfere a mesma cópia, preserva resolução/medidas/giro, mantém folha vazia como destino e recalcula o consumo', () => {
    const original = { ...placed('art-0', 'art', 30), widthCm: 10, heightCm: 5, angle: 90,
      contentWidthPx: 1000, contentHeightPx: 500 }
    useGangSheetStore.setState({ pages: [
      { index: 0, items: [original], usedHeightCm: 40 },
      { index: 1, items: [placed('art-1', 'art', 0)], usedHeightCm: 10 },
    ] })
    const images = useGangSheetStore.getState().images
    const before = calculateConsumption(useGangSheetStore.getState().pages, 57, 55)
    expect(useGangSheetStore.getState().movePlacedItem(0, 'art-0', 1, 15, 0)).toBe(true)
    const state = useGangSheetStore.getState()
    expect(state.pages[0]).toEqual({ index: 0, items: [], usedHeightCm: 0 })
    expect(state.pages[1].items[1]).toEqual({ ...original, xCm: 15, yCm: 0 })
    expect(state.pages.flatMap(page => page.items).map(item => item.id).sort()).toEqual(['art-0', 'art-1'])
    expect(state.images).toBe(images)
    const totals = calculateConsumption(state.pages, 57, 55)
    expect(totals.units).toBe(2)
    expect(totals.cost).toBeLessThan(before.cost)
    expect(state.packingProgress).toBeNull()
  })
  it('não perde a arte se o destino não existir ou se não couber com as medidas originais', () => {
    const pages = useGangSheetStore.getState().pages
    expect(useGangSheetStore.getState().movePlacedItem(0, 'art-0', 9, 0, 0)).toBe(false)
    expect(useGangSheetStore.getState().movePlacedItem(0, 'art-0', 1, NaN, 0)).toBe(false)
    useGangSheetStore.setState({ maxHeightCm: 9 })
    expect(useGangSheetStore.getState().movePlacedItem(0, 'art-0', 1, 0, 0)).toBe(false)
    expect(useGangSheetStore.getState().pages).toBe(pages)
  })
  it('apagar uma cópia atualiza a fila para que ela não volte na próxima otimização', async () => {
    useGangSheetStore.getState().removePlacedItem(0, 'art-0')
    expect(useGangSheetStore.getState().images[0].quantity).toBe(1)
    expect(useGangSheetStore.getState().pages[1].items[0].id).toBe('art-1')
    const task = useGangSheetStore.getState().generateLayout()
    expect(FakeWorker.latest.input?.images[0]).toMatchObject({ quantity: 1 })
    useGangSheetStore.getState().cancelPacking()
    expect(await task).toBe(false)
  })
  it('apagar a última cópia libera o arquivo original somente depois da última remoção', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    useGangSheetStore.getState().removePlacedItem(0, 'art-0')
    expect(revoke).not.toHaveBeenCalled()
    useGangSheetStore.getState().removePlacedItem(1, 'art-1')
    expect(revoke).toHaveBeenCalledWith('blob:art')
    expect(useGangSheetStore.getState().images).toEqual([])
    expect(calculateConsumption(useGangSheetStore.getState().pages, 57, 55).cost).toBe(0)
    revoke.mockRestore()
  })
  it('duplicar cria identificadores únicos e mantém a quantidade da fila sincronizada', () => {
    useGangSheetStore.getState().duplicatePlacedItem(0, 'art-0')
    useGangSheetStore.getState().duplicatePlacedItem(0, 'art-0')
    const state = useGangSheetStore.getState()
    expect(state.images[0].quantity).toBe(4)
    const items = state.pages.flatMap(page => page.items)
    expect(new Set(items.map(item => item.id)).size).toBe(4)
    expect(items.every(item => item.contentWidthPx === 1000)).toBe(true)
  })
  it('a transferência cancela uma busca pendente antes que a resposta restaure a posição antiga', async () => {
    const task = useGangSheetStore.getState().generateLayout(), worker = FakeWorker.latest
    useGangSheetStore.getState().movePlacedItem(0, 'art-0', 1, 15, 0)
    worker.emit({ type: 'result', result: { pages: [], unplaced: [], strategy: 'antigo' } })
    expect(await task).toBe(false)
    expect(worker.terminated).toBe(true)
    expect(useGangSheetStore.getState().pages[1].items).toHaveLength(2)
  })
  it('uma folha vazia não consome filme, e apagar a folha reduz também as cópias solicitadas', () => {
    const cost = calculateConsumption(useGangSheetStore.getState().pages, 57, 55).cost
    expect(useGangSheetStore.getState().addPage()).toBe(2)
    expect(calculateConsumption(useGangSheetStore.getState().pages, 57, 55).cost).toBe(cost)
    useGangSheetStore.getState().removePage(0)
    expect(useGangSheetStore.getState().images[0].quantity).toBe(1)
    expect(useGangSheetStore.getState().pages[0].items[0].id).toBe('art-1')
  })
})

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
    const pages = [{ index: 0, usedHeightCm: 73.9, items: [{ ...placed('art-0', 'art', 0), heightCm: 73.9 }] }]
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
    expect(totals().lengthCm).toBeCloseTo(15 * Math.SQRT2 + 0.1)
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
