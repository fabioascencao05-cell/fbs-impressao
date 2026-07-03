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
  const costPerCm2 = useGangSheetStore((s) => s.costPerCm2)

  const [selection, setSelection] = useState<SelectionInfo | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

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
    generateLayout()
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

  // Delete key removes the selected art.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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

      <div ref={scrollRef} className="flex-1 overflow-auto bg-muted/30 p-8">
        {visiblePages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border bg-card">
              <Layers className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium">Nenhum layout gerado ainda</p>
            <p className="max-w-xs text-xs">
              Envie imagens (PNG, JPG, WebP) na barra lateral, defina quantidade e largura, e
              clique em "Gerar Layout" para montar a folha de {canvasWidthCm}cm. Depois é só
              puxar, mover e girar cada arte.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-10">
            {visiblePages.map((page) => {
              const eff = sheetEfficiency(page, canvasWidthCm)
              const effVariant = eff >= 0.7 ? 'success' : eff >= 0.4 ? 'secondary' : 'warning'
              const usedArea = page.items.reduce((sum, it) => sum + it.widthCm * it.heightCm, 0)
              const pageCost = costPerCm2 > 0 ? usedArea * costPerCm2 : 0
              return (
                <div key={page.index} className="flex flex-col">
                  <div className="mb-1 flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold text-foreground/80">
                      Página {page.index + 1}
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
                  <div className="flex">
                    <div style={{ marginTop: pxPerCm }}>
                      <Ruler orientation="vertical" lengthCm={maxHeightCm} pxPerCm={pxPerCm} />
                    </div>
                    <div className="flex flex-col">
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
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
