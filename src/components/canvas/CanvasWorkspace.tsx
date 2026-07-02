import { useGangSheetStore } from '@/store/useGangSheetStore'
import { CANVAS_WIDTH_CM, DISPLAY_PX_PER_CM } from '@/lib/constants'
import Ruler from './Ruler'
import CanvasPage from './CanvasPage'

export default function CanvasWorkspace() {
  const pages = useGangSheetStore((s) => s.pages)
  const maxHeightCm = useGangSheetStore((s) => s.maxHeightCm)

  const visiblePages = pages.filter((p) => p.items.length > 0)

  return (
    <main className="flex-1 overflow-auto bg-neutral-100 p-8">
      {visiblePages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <p className="text-sm font-medium">Nenhum layout gerado ainda</p>
          <p className="max-w-xs text-xs">
            Envie imagens PNG na barra lateral, defina quantidade e largura, e clique em
            "Gerar Layout" para montar a folha de {CANVAS_WIDTH_CM}cm.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-10">
          {visiblePages.map((page) => (
            <div key={page.index} className="flex flex-col">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold text-neutral-700">
                  Página {page.index + 1}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {CANVAS_WIDTH_CM}cm × {maxHeightCm}cm · usado{' '}
                  {page.usedHeightCm.toFixed(1)}cm
                </span>
              </div>
              <div className="flex">
                <div style={{ marginTop: DISPLAY_PX_PER_CM }}>
                  <Ruler orientation="vertical" lengthCm={maxHeightCm} />
                </div>
                <div className="flex flex-col">
                  <Ruler orientation="horizontal" lengthCm={CANVAS_WIDTH_CM} />
                  <CanvasPage page={page} maxHeightCm={maxHeightCm} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
