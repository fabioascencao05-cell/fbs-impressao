import { calculateConsumption } from '@/lib/consumption'
import ConsumptionSummary from './ConsumptionSummary'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Layers, Trash2 } from 'lucide-react'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import { DISPLAY_PX_PER_CM, ZOOM_MAX, ZOOM_MIN } from '@/lib/constants'
import { dropPlacement, findPageSpace, type ArtDrag } from '@/lib/pageEditing'
import { rotatedAabbCm } from '@/lib/geometry'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Ruler from './Ruler'
import CanvasPage, { type SelectionInfo } from './CanvasPage'
import CanvasToolbar from './CanvasToolbar'
import { toast } from '@/hooks/use-toast'
export default function CanvasWorkspace() {
  const pages = useGangSheetStore((s) => s.pages)
  const maxHeightCm = useGangSheetStore((s) => s.maxHeightCm)
  const canvasWidthCm = useGangSheetStore((s) => s.canvasWidthCm)
  const zoom = useGangSheetStore((s) => s.zoom)
  const setZoom = useGangSheetStore((s) => s.setZoom)
  const generateLayout = useGangSheetStore((s) => s.generateLayout)
  const removePlacedItem = useGangSheetStore((s) => s.removePlacedItem)
  const movePlacedItem = useGangSheetStore((s) => s.movePlacedItem)
  const addPage = useGangSheetStore((s) => s.addPage)
  const duplicatePlacedItem = useGangSheetStore((s) => s.duplicatePlacedItem)
  const removePage = useGangSheetStore((s) => s.removePage)
  const costPerMeter = useGangSheetStore((s) => s.costPerMeter)

  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const [drag, setDrag] = useState<ArtDrag | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const hadPagesRef = useRef(false)
  // Pending zoom-to-cursor correction, applied after the zoom re-render lands.
  const zoomAnchorRef = useRef<{
    cursorX: number
    cursorY: number
    padL: number
    padT: number
    scrollLeft: number
    scrollTop: number
    ratio: number
  } | null>(null)

  const pxPerCm = DISPLAY_PX_PER_CM * zoom
  const visiblePages = pages

  const handleSelectionChange = useCallback((sel: SelectionInfo | null, pageIndex: number) => {
    setSelection(current => sel ?? (current?.pageIndex === pageIndex ? null : current))
  }, [])

  useEffect(() => {
    setSelection(current => {
      if (!current) return null
      const page = pages.find(page => page.items.some(item => item.id === current.itemId))
      if (!page) return null
      return page.index === current.pageIndex ? current : { ...current, pageIndex: page.index }
    })
  }, [pages])

  const getDropTarget = useCallback((moving: ArtDrag) => {
    const state = useGangSheetStore.getState()
    const item = state.pages.find(page => page.index === moving.pageIndex)?.items.find(item => item.id === moving.itemId)
    if (!item) return null
    for (const sheet of contentRef.current?.querySelectorAll<HTMLElement>('[data-sheet-page]') ?? []) {
      const pageIndex = Number(sheet.dataset.sheetPage)
      if (pageIndex === moving.pageIndex) continue
      const rect = (sheet.querySelector('canvas.upper-canvas') ?? sheet).getBoundingClientRect()
      const position = dropPlacement(item, moving, rect, state.canvasWidthCm, state.maxHeightCm)
      if (position) return { pageIndex, item, position }
    }
    return null
  }, [])

  const dropTarget = useMemo(() => drag ? getDropTarget(drag) : null, [drag, getDropTarget])
  const handleArtDrop = useCallback((moving: ArtDrag) => {
    const target = getDropTarget(moving)
    if (!target) return false
    const moved = movePlacedItem(moving.pageIndex, moving.itemId, target.pageIndex, target.position.xCm, target.position.yCm)
    if (moved) setSelection({ pageIndex: target.pageIndex, itemId: moving.itemId,
      widthCm: target.item.widthCm, heightCm: target.item.heightCm, angle: target.item.angle })
    return moved
  }, [getDropTarget, movePlacedItem])

  // Scroll to distant sheets while holding the art near the viewport edge.
  useEffect(() => {
    if (!drag) return
    let frame = 0
    const scroll = () => {
      const el = scrollRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        const speed = drag.clientY < rect.top + 60 ? -18 : drag.clientY > rect.bottom - 60 ? 18 : 0
        if (speed) {
          const before = el.scrollTop
          el.scrollTop += speed
          if (el.scrollTop !== before) setDrag(current => current && { ...current })
        }
      }
      frame = requestAnimationFrame(scroll)
    }
    frame = requestAnimationFrame(scroll)
    return () => cancelAnimationFrame(frame)
  }, [drag])

  const handleMoveSelected = useCallback((targetPageIndex: number) => {
    if (!selection) return
    const state = useGangSheetStore.getState()
    const item = state.pages.find(page => page.index === selection.pageIndex)?.items.find(item => item.id === selection.itemId)
    const target = state.pages.find(page => page.index === targetPageIndex)
    if (!item || !target) return
    const position = findPageSpace(item, target.items, state.canvasWidthCm, state.maxHeightCm, state.itemGapCm)
    if (!position) {
      toast({ title: 'Sem espaço livre nesta folha', description: 'Crie uma nova folha ou arraste a arte para a posição desejada.' })
      return
    }
    if (movePlacedItem(selection.pageIndex, item.id, targetPageIndex, position.xCm, position.yCm))
      setSelection({ ...selection, pageIndex: targetPageIndex })
  }, [selection, movePlacedItem])

  const handleAddPage = useCallback(() => { addPage() }, [addPage])

  const handleDeleteSelected = useCallback(() => {
    if (!selection) return
    removePlacedItem(selection.pageIndex, selection.itemId)
    setSelection(null)
  }, [selection, removePlacedItem])

  const handleDuplicateSelected = useCallback(() => {
    if (!selection) return
    duplicatePlacedItem(selection.pageIndex, selection.itemId)
  }, [selection, duplicatePlacedItem])

  const handleDeletePage = useCallback(
    (pageIndex: number) => {
      if (!window.confirm(`Apagar a página ${pageIndex + 1}? Essa ação não pode ser desfeita.`))
        return
      removePage(pageIndex)
      setSelection(null)
    },
    [removePage]
  )

  const handleRegenerate = useCallback(async () => {
    try { if (await generateLayout()) setSelection(null) } catch (error) {
      toast({ variant: 'destructive', title: 'Falha ao otimizar', description: error instanceof Error ? error.message : 'Tente novamente.' })
    }
  }, [generateLayout])

  const handleZoomFit = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    // Fit the sheet width (plus ruler + padding) into the viewport.
    const available = el.clientWidth - DISPLAY_PX_PER_CM - 80
    const fit = available / (canvasWidthCm * DISPLAY_PX_PER_CM)
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit)))
  }, [setZoom, canvasWidthCm])

  // Auto-fit the zoom the first time a layout is generated, so the full
  // sheet width is visible without manual scrolling. Only fires on the
  // empty -> filled transition, never on later regenerates/zoom changes.
  useEffect(() => {
    const hasPages = visiblePages.length > 0
    if (hasPages && !hadPagesRef.current) handleZoomFit()
    hadPagesRef.current = hasPages
  }, [visiblePages.length, handleZoomFit])

  // CorelDraw-style zooming: Ctrl/⌘ + wheel zooms toward the cursor, plain
  // wheel keeps scrolling/panning the sheet. Attached natively so we can
  // preventDefault the browser's own ctrl+wheel page zoom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const content = contentRef.current
      if (!content) return
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor))
      if (nextZoom === zoom) return
      const elRect = el.getBoundingClientRect()
      const style = getComputedStyle(content)
      // Only the sheets scale with zoom; the wrapper's padding stays fixed, so
      // anchor relative to the padding edge to keep the cursor point stable.
      zoomAnchorRef.current = {
        cursorX: e.clientX - elRect.left,
        cursorY: e.clientY - elRect.top,
        padL: parseFloat(style.paddingLeft) || 0,
        padT: parseFloat(style.paddingTop) || 0,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        ratio: nextZoom / zoom,
      }
      setZoom(nextZoom)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, setZoom])

  // After a wheel-zoom re-render, set the scroll so the point that was under the
  // cursor stays under it. The scaling content starts after the fixed padding,
  // so only the distance past the padding edge grows by `ratio`.
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current
    if (!anchor) return
    zoomAnchorRef.current = null
    const el = scrollRef.current
    if (!el) return
    const contentX = anchor.scrollLeft + anchor.cursorX
    const contentY = anchor.scrollTop + anchor.cursorY
    el.scrollLeft = anchor.padL + (contentX - anchor.padL) * anchor.ratio - anchor.cursorX
    el.scrollTop = anchor.padT + (contentY - anchor.padT) * anchor.ratio - anchor.cursorY
  }, [zoom])

  // Delete key removes the selected art.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.isContentEditable || target?.closest('input, textarea, select')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault()
        handleDeleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, handleDeleteSelected])

  return (
    <main className="fbs-canvas flex flex-1 flex-col overflow-hidden">
      <ConsumptionSummary />
      {visiblePages.length > 0 && (
        <CanvasToolbar
          zoom={zoom}
          onZoom={setZoom}
          onZoomFit={handleZoomFit}
          selection={selection}
          onDeleteSelected={handleDeleteSelected}
          onDuplicateSelected={handleDuplicateSelected}
          onRegenerate={handleRegenerate}
          pageIndices={pages.map(page => page.index)}
          onAddPage={handleAddPage}
          onMoveSelected={handleMoveSelected}
        />
      )}

      <div ref={scrollRef} className="workspace-bg flex-1 overflow-auto">
        {visiblePages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="fbs-empty-state flex max-w-md flex-col items-center gap-4 rounded-3xl border border-dashed bg-card/50 px-8 py-10 text-center">
              <div className="glow-primary flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Layers className="h-7 w-7" />
              </div>
              <p className="fbs-kicker -mb-2">Fluxo de produção</p>
              <p className="text-base font-semibold text-foreground">Sua folha aparece aqui</p>
              <ol className="w-full space-y-2 text-left text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                    1
                  </span>
                  Envie imagens (PNG, JPG, WebP) na barra lateral
                </li>
                <li className="flex gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                    2
                  </span>
                  Defina quantidade e largura de cada arte
                </li>
                <li className="flex gap-2">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                    3
                  </span>
                  Clique em "Gerar Layout" para montar a folha de {canvasWidthCm}cm
                </li>
              </ol>
              <p className="text-xs text-muted-foreground">
                Depois é só puxar, mover e girar cada arte.
              </p>
            </div>
          </div>
        ) : (
          <div
            ref={contentRef}
            className="mx-auto flex w-fit min-w-full flex-col items-center gap-10 p-8 md:px-16"
          >
            {visiblePages.map((page) => {
              const sheetHeightCm = maxHeightCm
              const consumption = calculateConsumption([page], canvasWidthCm, costPerMeter)
              const eff = consumption.efficiency / 100
              const effVariant = eff >= 0.7 ? 'success' : eff >= 0.4 ? 'secondary' : 'warning'
              return (
                <div key={page.index} className="flex flex-col">
                  <div className="fbs-tool-card mb-2 flex w-full items-center justify-between gap-4 rounded-xl border bg-card/70 px-3 py-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      Página {page.index + 1} · {page.items.length} arte(s)
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {canvasWidthCm}cm × {sheetHeightCm.toFixed(1)}cm · usado{' '}
                        {consumption.lengthCm.toFixed(2)}cm
                      </span>
                      <Badge variant={effVariant} title="Área estimada pelos contornos das artes sobre o filme usado">
                        {Math.round(eff * 100)}% aproveitado
                      </Badge>
                      {consumption.cost >= 0 && (
                        <Badge variant="outline" title="Comprimento realmente consumido ÷ 100 × custo por metro">
                          {consumption.cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title="Apagar esta página"
                        onClick={() => handleDeletePage(page.index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className={`relative overflow-hidden rounded-xl shadow-xl ring-1 ${dropTarget?.pageIndex === page.index ? 'ring-4 ring-primary' : 'ring-black/10 dark:ring-white/10'}`}>
                    <Ruler orientation="horizontal" lengthCm={canvasWidthCm} pxPerCm={pxPerCm} />
                    <CanvasPage
                      page={page}
                      canvasWidthCm={canvasWidthCm}
                      sheetHeightCm={sheetHeightCm}
                      pxPerCm={pxPerCm}
                      selectedItemId={selection?.pageIndex === page.index ? selection.itemId : null}
                      onSelectionChange={handleSelectionChange}
                      onArtDrag={setDrag}
                      onArtDrop={handleArtDrop}
                    />
                    {dropTarget?.pageIndex === page.index && (() => {
                      const box = rotatedAabbCm(dropTarget.item.widthCm, dropTarget.item.heightCm, dropTarget.item.angle)
                      return <div className="pointer-events-none absolute rounded border-2 border-dashed border-primary bg-primary/15"
                        style={{ left: dropTarget.position.xCm * pxPerCm, top: (dropTarget.position.yCm + 1) * pxPerCm,
                          width: box.wCm * pxPerCm, height: box.hCm * pxPerCm }} />
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {drag && <div className="pointer-events-none fixed z-50 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-lg"
        style={{ left: drag.clientX + 16, top: drag.clientY + 16 }}>
        {dropTarget ? `Solte na folha ${dropTarget.pageIndex + 1}` : 'Arraste até outra folha · bordas rolam a tela'}
      </div>}
    </main>
  )
}
