import { ZoomIn, ZoomOut, Maximize, Trash2, RefreshCw, MousePointer2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/lib/constants'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import type { SelectionInfo } from './CanvasPage'

const BG_PRESETS: { value: string; label: string; swatch: string }[] = [
  { value: '#ffffff', label: 'Fundo branco', swatch: '#ffffff' },
  { value: '#9ca3af', label: 'Fundo cinza', swatch: '#9ca3af' },
  { value: '#18181b', label: 'Fundo preto', swatch: '#18181b' },
  {
    value: 'checkerboard',
    label: 'Fundo xadrez (transparência)',
    swatch:
      'conic-gradient(#d4d4d8 0deg 90deg, #fff 90deg 180deg, #d4d4d8 180deg 270deg, #fff 270deg 360deg)',
  },
]

interface CanvasToolbarProps {
  zoom: number
  onZoom: (z: number) => void
  onZoomFit: () => void
  selection: SelectionInfo | null
  onDeleteSelected: () => void
  onRegenerate: () => void
  onRotateSelected: () => void
}

export default function CanvasToolbar({
  zoom,
  onZoom,
  onZoomFit,
  selection,
  onDeleteSelected,
  onRegenerate,
  onRotateSelected,
}: CanvasToolbarProps) {
  const sheetBackgroundColor = useGangSheetStore((s) => s.sheetBackgroundColor)
  const setSheetBackgroundColor = useGangSheetStore((s) => s.setSheetBackgroundColor)

  return (
    <div className="glass-panel sticky top-0 z-10 flex flex-wrap items-center gap-2 overflow-x-auto border-b px-4 py-2">
      <div className="flex shrink-0 items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
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
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onZoom(zoom + ZOOM_STEP)}
          disabled={zoom >= ZOOM_MAX}
          title="Aumentar zoom"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onZoomFit}
          title="Ajustar à tela"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div
        className="flex items-center gap-1.5"
        title="Cor de fundo da folha (só visual, exportação continua transparente)"
      >
        <span className="text-[11px] text-muted-foreground">Fundo</span>
        {BG_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            title={preset.label}
            onClick={() => setSheetBackgroundColor(preset.value)}
            className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
              sheetBackgroundColor === preset.value ? 'border-primary' : 'border-border'
            }`}
            style={{ background: preset.swatch }}
          />
        ))}
        <input
          type="color"
          value={sheetBackgroundColor.startsWith('#') ? sheetBackgroundColor : '#ffffff'}
          onChange={(e) => setSheetBackgroundColor(e.target.value)}
          title="Escolher outra cor de fundo"
          className="h-6 w-6 cursor-pointer rounded-full border-2 border-border bg-transparent p-0"
        />
      </div>

      <Separator orientation="vertical" className="h-6" />

      <Button variant="outline" size="sm" className="h-8" onClick={onRegenerate} title="Reorganiza tudo automaticamente (descarta ajustes manuais)">
        <RefreshCw className="h-4 w-4" />
        Re-empacotar
      </Button>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {selection ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={onRotateSelected}
              title="Girar 90° a arte selecionada"
            >
              <RotateCw className="h-4 w-4" />
              Girar 90°
            </Button>
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
          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
            <MousePointer2 className="h-3.5 w-3.5" />
            Clique numa arte para mover, redimensionar ou girar
          </span>
        )}
      </div>
    </div>
  )
}
