import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layers, Trash2 } from 'lucide-react'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import { DISPLAY_PX_PER_CM, ZOOM_MAX, ZOOM_MIN } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Ruler from './Ruler'
import CanvasPage, { type SelectionInfo } from './CanvasPage'
import CanvasToolbar from './CanvasToolbar'
import type { PackedPage } from '@/types'

function sheetEfficiency(page: PackedPage, canvasWidthCm: number): number {
  if (page.usedHeightCm <= 0) return 0
  const usedArea = page.items.reduce((sum, it) => sum + it.widthCm * it.heightCm, 0)
  const regionArea = canvasWidthCm * page.usedHeightCm
  return regionArea > 0 ? Math.min(1, usedArea / regionArea) : 0
}

export default function CanvasWorkspace() {
  const pages = useGangSheetStore((s) => s.pages)
  const maxHeightCm = useGangSheetStore((s) => s.maxHeightCm)
  const canvasWidthCm = useGangSheetStore((s) => s.canvasWidthCm)
  const zoom = useGangSheetStore((s) => s.zoom)
  const setZoom = useGangSheetStore((s) => s.setZoom)
  const generateLayout = useGangSheetStore((s) => s.generateLayout)
  const removePlacedItem = useGangSheetStore((s) => s.removePlacedItem)
  const removePage = useGangSheetStore((s) => s.removePage)
  const pricePerLinearMeter = useGangSheetStore((s) => s.pricePerLinearMeter)

  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hadPagesRef = useRef(false)

  const pxPerCm = DISPLAY_PX_PER_CM * zoom
  const visiblePages = useMemo(() => pages.filter((p) => p.items.length > 0), [pages])

  const handleDeleteSelected = useCallback(() => {
    if (!selection) return
    removePlacedItem(selection.pageIndex, selection.itemId)
    setSelection(null)
  }, [selection, removePlacedItem])

  const handleDeletePage = useCallback(
    (pageIndex: number) => {
      if (!window.confirm(`Apagar a página ${pageIndex + 1}? Essa ação não pode ser desfeita.`))
        return
      removePage(pageIndex)
      setSelection((sel) => (sel?.pageIndex === pageIndex ? null : sel))
    },
    [removePage]
  )

  const handleRegenerate = useCallback(() => {
    void generateLayout()
    setSelection(null)
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

  // Delete key removes the selected art.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack Delete while the user is editing a form field (quantity,
      // width, sheet size, etc.) — it should delete text, not the selected art.
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
      if (e.key === 'Delete' && selection) {
        e.preventDefault()
        handleDeleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection, handleDeleteSelected])

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {visiblePages.length > 0 && (
        <CanvasToolbar
          zoom={zoom}
          onZoom={setZoom}
          onZoomFit={handleZoomFit}
          selection={selection}
          onDeleteSelected={handleDeleteSelected}
          onRegenerate={handleRegenerate}
        />
      )}

      <div ref={scrollRef} className="workspace-bg flex-1 overflow-auto p-8">
        {visiblePages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-dashed bg-card/50 px-8 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Layers className="h-7 w-7" />
              </div>
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
          <div className="flex flex-col items-start gap-10">
            {visiblePages.map((page) => {
              const eff = sheetEfficiency(page, canvasWidthCm)
              const effVariant = eff >= 0.7 ? 'success' : eff >= 0.4 ? 'secondary' : 'warning'
              const pageCost =
                pricePerLinearMeter > 0 ? (page.usedHeightCm / 100) * pricePerLinearMeter : 0
              return (
                <div key={page.index} className="flex flex-col">
                  <div className="mb-2 flex w-full items-center justify-between gap-4 rounded-lg border bg-card/70 px-3 py-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground/80">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      Página {page.index + 1} · {page.items.length} arte(s)
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {canvasWidthCm}cm × {maxHeightCm}cm · usado{' '}
                        {page.usedHeightCm.toFixed(1)}cm
                      </span>
                      <Badge variant={effVariant} title="Aproveitamento da área usada">
                        {Math.round(eff * 100)}% aproveitado
                      </Badge>
                      {pageCost > 0 && (
                        <Badge variant="outline" title="Custo estimado desta página">
                          R$ {pageCost.toFixed(2)}
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
                  <div className="flex flex-col shadow-lg ring-1 ring-black/10 dark:ring-white/10">
                    <Ruler orientation="horizontal" lengthCm={canvasWidthCm} pxPerCm={pxPerCm} />
                    <CanvasPage
                      page={page}
                      canvasWidthCm={canvasWidthCm}
                      maxHeightCm={maxHeightCm}
                      pxPerCm={pxPerCm}
                      onSelectionChange={setSelection}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
