import { ZoomIn, ZoomOut, Maximize, Trash2, RefreshCw, MousePointer2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/lib/constants'
import type { SelectionInfo } from './CanvasPage'

interface CanvasToolbarProps {
  zoom: number
  onZoom: (z: number) => void
  onZoomFit: () => void
  selection: SelectionInfo | null
  onDeleteSelected: () => void
  onRegenerate: () => void
}

export default function CanvasToolbar({
  zoom,
  onZoom,
  onZoomFit,
  selection,
  onDeleteSelected,
  onRegenerate,
}: CanvasToolbarProps) {
  return (
    <div className="glass-panel sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-2">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onZoom(zoom - ZOOM_STEP)}
          disabled={zoom <= ZOOM_MIN}
          title="Diminuir zoom"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onZoom(zoom + ZOOM_STEP)}
          disabled={zoom >= ZOOM_MAX}
          title="Aumentar zoom"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={onZoomFit}
          title="Ajustar à tela"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <Button variant="outline" size="sm" className="h-8" onClick={onRegenerate} title="Reorganiza tudo automaticamente (descarta ajustes manuais)">
        <RefreshCw className="h-4 w-4" />
        Re-empacotar
      </Button>

      <div className="ml-auto flex items-center gap-2">
        {selection ? (
          <>
            <Badge variant="secondary" className="tabular-nums">
              {selection.widthCm.toFixed(1)} × {selection.heightCm.toFixed(1)} cm
              {selection.angle ? ` · ${Math.round(selection.angle)}°` : ''}
            </Badge>
            <Button
              variant="destructive"
              size="sm"
              className="h-8"
              onClick={onDeleteSelected}
              title="Remover arte selecionada (Delete)"
            >
              <Trash2 className="h-4 w-4" />
              Remover
            </Button>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MousePointer2 className="h-3.5 w-3.5" />
            Clique numa arte para mover, redimensionar ou girar
          </span>
        )}
      </div>
    </div>
  )
}
