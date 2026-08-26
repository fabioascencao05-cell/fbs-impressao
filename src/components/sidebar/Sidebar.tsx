import { LayoutGrid, Download, X, Layers, ImageOff, Trash2, Gauge, Ruler, Sparkles } from 'lucide-react'
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
import { toast } from '@/hooks/use-toast'
import { useMemo, useState } from 'react'
import { EXPORT_END_MARGIN_CM } from '@/lib/constants'

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
  const unplacedImages = useGangSheetStore((s) => s.unplacedImages)
  const packingStrategy = useGangSheetStore((s) => s.packingStrategy)
  const reset = useGangSheetStore((s) => s.reset)
  const [isExporting, setIsExporting] = useState(false)

  const hasLayout = pages.some((p) => p.items.length > 0)
  const totalUnits = images.reduce((n, img) => n + img.quantity, 0)
  const layoutStats = useMemo(() => {
    const visible = pages.filter((page) => page.items.length > 0)
    const artArea = visible.flatMap((page) => page.items).reduce((sum, item) => sum + item.widthCm * item.heightCm, 0)
    const filmHeight = visible.reduce((sum, page) => sum + Math.min(maxHeightCm, page.usedHeightCm + EXPORT_END_MARGIN_CM), 0)
    const filmArea = canvasWidthCm * filmHeight
    return {
      pages: visible.length,
      filmHeight,
      efficiency: filmArea > 0 ? Math.min(100, (artArea / filmArea) * 100) : 0,
    }
  }, [canvasWidthCm, maxHeightCm, pages])

  const handleGenerateLayout = () => {
    generateLayout()
    const skipped = useGangSheetStore.getState().unplacedImages
    if (skipped.length > 0) {
      toast({
        variant: 'destructive',
        title: `${skipped.length} arte(s) não couberam`,
        description: 'Reduza a largura da arte, aumente a folha ou permita uma altura máxima maior.',
      })
    } else {
      const current = useGangSheetStore.getState()
      const count = current.pages.filter((page) => page.items.length > 0).length
      toast({ title: 'Folha otimizada', description: `${count} página(s) gerada(s) com encaixe inteligente.` })
    }
    onClose?.()
  }

  const handleClearAll = () => {
    if (!window.confirm('Remover todas as imagens e o layout gerado?')) return
    reset()
  }

  const handleDownload = async () => {
    if (unplacedImages.length > 0) {
      toast({ variant: 'destructive', title: 'Ainda há artes sem posição', description: 'Ajuste as medidas ou a altura máxima e gere o layout de novo antes de baixar.' })
      return
    }
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
    <aside className="glass-panel flex h-full w-full shrink-0 flex-col overflow-x-hidden border-r md:h-full md:w-[var(--sidebar-w,340px)]">
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
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} title="Fechar" className="shrink-0 md:hidden">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        <ImageUploadZone />

        <div className="space-y-1.5 rounded-lg border bg-muted/40 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Ruler className="h-3.5 w-3.5" /> Tamanho da Folha
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
              <Label htmlFor="max-height">Limite/página (cm)</Label>
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
          <p className="text-[10px] leading-relaxed text-muted-foreground">A exportação usa só a altura ocupada. Este limite apenas divide folhas muito longas em páginas menores.</p>
        </div>
      </div>

      {hasLayout && (
        <div className="mx-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-primary"><Gauge className="h-3.5 w-3.5" /> Aproveitamento</span>
            <span className="text-sm font-bold tabular-nums text-primary">{Math.round(layoutStats.efficiency)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-primary/15">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${layoutStats.efficiency}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{layoutStats.pages} página(s)</span>
            <span>{layoutStats.filmHeight.toFixed(1)} cm de filme</span>
          </div>
          {packingStrategy && <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground"><Sparkles className="h-3 w-3" /> Encaixe: {packingStrategy}</p>}
        </div>
      )}

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
        {unplacedImages.length > 0 && (
          <p className="rounded-md bg-destructive/10 px-2 py-1 text-center text-[11px] font-medium text-destructive">
            {unplacedImages.length} cópia(s) não couberam na folha atual.
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
          disabled={!hasLayout || isExporting || unplacedImages.length > 0}
          onClick={handleDownload}
        >
          <Download className="h-4 w-4" />
          {isExporting ? 'Exportando...' : 'Download DTF'}
        </Button>
      </div>
    </aside>
  )
}
