import { LayoutGrid, Download, LogOut, X, Layers, ImageOff, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import ImageUploadZone from './ImageUploadZone'
import ImageQueueItem from './ImageQueueItem'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import { downloadGangSheets } from '@/lib/exportCanvas'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/hooks/use-toast'
import { ThemeToggle } from '@/components/theme-toggle'
import { useState } from 'react'

interface SidebarProps {
  onClose?: () => void
}

export default function Sidebar({ onClose }: SidebarProps) {
  const images = useGangSheetStore((s) => s.images)
  const maxHeightCm = useGangSheetStore((s) => s.maxHeightCm)
  const setMaxHeightCm = useGangSheetStore((s) => s.setMaxHeightCm)
  const canvasWidthCm = useGangSheetStore((s) => s.canvasWidthCm)
  const setCanvasWidthCm = useGangSheetStore((s) => s.setCanvasWidthCm)
  const itemGapCm = useGangSheetStore((s) => s.itemGapCm)
  const setItemGapCm = useGangSheetStore((s) => s.setItemGapCm)
  const costPerCm2 = useGangSheetStore((s) => s.costPerCm2)
  const setCostPerCm2 = useGangSheetStore((s) => s.setCostPerCm2)
  const generateLayout = useGangSheetStore((s) => s.generateLayout)
  const pages = useGangSheetStore((s) => s.pages)
  const reset = useGangSheetStore((s) => s.reset)
  const { signOut } = useAuth()
  const [isExporting, setIsExporting] = useState(false)

  const hasLayout = pages.some((p) => p.items.length > 0)
  const totalUnits = images.reduce((n, img) => n + img.quantity, 0)

  const handleGenerateLayout = () => {
    generateLayout()
    onClose?.()
  }

  const handleClearAll = () => {
    if (!window.confirm('Remover todas as imagens e o layout gerado?')) return
    reset()
  }

  const handleDownload = async () => {
    setIsExporting(true)
    try {
      await downloadGangSheets(pages, canvasWidthCm, maxHeightCm)
      const pageCount = pages.filter((p) => p.items.length > 0).length
      toast({
        title: 'Exportação concluída',
        description:
          pageCount > 1
            ? `${pageCount} páginas exportadas em .zip a 300 DPI.`
            : 'Folha exportada em PNG a 300 DPI (fundo transparente).',
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Falha na exportação',
        description: err instanceof Error ? err.message : 'Erro desconhecido.',
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <aside className="glass-panel flex h-full w-full shrink-0 flex-col overflow-x-hidden border-r md:h-screen md:w-[var(--sidebar-w,340px)]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight">Gang Sheet Builder</h1>
            <p className="truncate text-xs text-muted-foreground">DTF · empacotamento inteligente</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} title="Fechar" className="md:hidden">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        <ImageUploadZone />

        <div className="space-y-1.5 rounded-lg border bg-muted/40 p-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tamanho da Folha
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <Label htmlFor="canvas-width">Largura (cm)</Label>
              <Input
                id="canvas-width"
                type="number"
                min={1}
                value={canvasWidthCm}
                onChange={(e) => setCanvasWidthCm(Number(e.target.value))}
              />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="max-height">Altura Máxima (cm)</Label>
              <Input
                id="max-height"
                type="number"
                min={1}
                value={maxHeightCm}
                onChange={(e) => setMaxHeightCm(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="item-gap" className="truncate" title="Espaçamento entre imagens (cm)">
                Espaço (cm)
              </Label>
              <Input
                id="item-gap"
                type="number"
                min={0}
                step={0.1}
                value={itemGapCm}
                onChange={(e) => setItemGapCm(Number(e.target.value))}
              />
            </div>
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="cost-cm2" className="truncate" title="Custo por cm² (R$)">
                Custo/cm² (R$)
              </Label>
              <Input
                id="cost-cm2"
                type="number"
                min={0}
                step={0.01}
                value={costPerCm2 || ''}
                placeholder="0.00"
                onChange={(e) => setCostPerCm2(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Fila
          {images.length > 0 && <Badge variant="secondary">{images.length}</Badge>}
        </div>
        {images.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
            onClick={handleClearAll}
          >
            <Trash2 className="h-3 w-3" />
            Limpar tudo
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 px-4 py-3">
        {images.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
            <ImageOff className="h-6 w-6 text-muted-foreground/60" />
            <p className="text-xs font-medium">Nenhuma imagem na fila</p>
            <p className="text-[11px] text-muted-foreground">Envie artes acima para começar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {images.map((img) => (
              <ImageQueueItem key={img.id} image={img} />
            ))}
          </div>
        )}
      </ScrollArea>

      <Separator />

      <div className="space-y-2 px-4 py-3">
        {images.length > 0 && (
          <p className="text-center text-[11px] text-muted-foreground">
            {images.length} arte(s) · {totalUnits} cópia(s) para empacotar
          </p>
        )}
        <Button
          className="glow-primary w-full"
          disabled={images.length === 0}
          onClick={handleGenerateLayout}
        >
          <LayoutGrid className="h-4 w-4" />
          Gerar Layout
        </Button>
        <Button
          className="w-full"
          variant="secondary"
          disabled={!hasLayout || isExporting}
          onClick={handleDownload}
        >
          <Download className="h-4 w-4" />
          {isExporting ? 'Exportando...' : 'Download DTF'}
        </Button>
      </div>
    </aside>
  )
}
