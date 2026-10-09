import { calculateConsumption, requestedImageTotals } from '@/lib/consumption'
import { LayoutGrid, Download, X, Layers, ImageOff, Trash2, Ruler, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import ImageUploadZone from './ImageUploadZone'
import ImageQueueItem from './ImageQueueItem'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import { downloadGangSheets } from '@/lib/exportCanvas'
import { toast } from '@/hooks/use-toast'
import { useMemo, useState } from 'react'
import { validateLayout } from '@/lib/layoutValidation'
import { exportDpi } from '@/lib/exportPlan'

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
  const costPerMeter = useGangSheetStore((s) => s.costPerMeter)
  const setCostPerMeter = useGangSheetStore((s) => s.setCostPerMeter)
  const packingProgress = useGangSheetStore((s) => s.packingProgress)
  const packingError = useGangSheetStore((s) => s.packingError)
  const cancelPacking = useGangSheetStore((s) => s.cancelPacking)
  const generateLayout = useGangSheetStore((s) => s.generateLayout)
  const pages = useGangSheetStore((s) => s.pages)
  const unplacedImages = useGangSheetStore((s) => s.unplacedImages)
  const packingStrategy = useGangSheetStore((s) => s.packingStrategy)
  const reset = useGangSheetStore((s) => s.reset)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const layoutIssues = useMemo(() => validateLayout(pages, canvasWidthCm, maxHeightCm, itemGapCm),
    [pages, canvasWidthCm, maxHeightCm, itemGapCm])

  const hasLayout = pages.some((p) => p.items.length > 0)
  const dpiValues = pages.filter(page => page.items.length > 0).map(exportDpi)
  const dpiLabel = dpiValues.length ? `${Math.min(...dpiValues)}${Math.max(...dpiValues) === Math.min(...dpiValues) ? '' : `–${Math.max(...dpiValues)}`} DPI` : '300+ DPI'
  const totalUnits = images.reduce((n, img) => n + img.quantity, 0)
  const layoutStats = useMemo(() => calculateConsumption(pages, canvasWidthCm, costPerMeter),
    [pages, canvasWidthCm, costPerMeter])
  const requested = useMemo(() => requestedImageTotals(images), [images])

  const handleGenerateLayout = async () => {
    try { if (!await generateLayout()) return } catch (error) {
      toast({ variant: 'destructive', title: 'Falha ao otimizar', description: error instanceof Error ? error.message : 'Tente novamente.' })
      return
    }
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
    setExportProgress(0)
    try {
      const warnings = await downloadGangSheets(pages, canvasWidthCm, maxHeightCm, itemGapCm,
        (done, total) => setExportProgress(Math.round(done / total * 100)))
      const pageCount = pages.filter((p) => p.items.length > 0).length
      toast({
        title: warnings.length ? 'Arquivo baixado — confira o espaço de corte' : 'Exportação concluída',
        description:
          pageCount > 1
            ? `${pageCount} páginas em PNG transparente, ${dpiLabel}, recortadas à área útil, sem reduzir a resolução das artes.`
            : `PNG transparente, ${dpiLabel}, recortado à área útil, sem reduzir a resolução das artes.`,
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
    <aside className="glass-panel fbs-side-panel flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden border-r md:h-full md:w-[var(--sidebar-w,340px)]">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="glow-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Layers className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="fbs-kicker mb-1">FBS DTF LAB</p>
            <h1 className="truncate text-sm font-semibold leading-tight tracking-tight">Montador de Folha</h1>
            <p className="truncate text-xs text-muted-foreground">DTF · aproveitamento inteligente</p>
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} title="Fechar" className="shrink-0 md:hidden">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <fieldset disabled={isExporting || !!packingProgress} aria-label="Artes e configuração da folha" className="fbs-sidebar-scroll m-0 min-h-0 min-w-0 flex-1 overflow-y-scroll overscroll-contain border-0 p-0">
        <div className="space-y-3 px-4 py-3">
          <ImageUploadZone />

          <div className="fbs-tool-card space-y-1.5 rounded-xl border bg-muted/40 p-2.5">
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
                <Label htmlFor="max-height">Área de trabalho (cm)</Label>
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
                <Label htmlFor="cost-meter" className="truncate" title="Custo por metro linear (R$)">
                  Custo/metro (R$)
                </Label>
                <Input
                  id="cost-meter"
                  type="number"
                  min={0}
                  step={0.01}
                  value={costPerMeter}
                  placeholder="0.00"
                  onChange={(e) => setCostPerMeter(Number(e.target.value))}
                />
              </div>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">Área disponível: {canvasWidthCm} × {maxHeightCm} cm. O custo considera somente o comprimento ocupado, incluindo espaços e margem final de 0,1 cm.</p>
            <p className="text-[10px] text-muted-foreground">O PNG baixa somente a área útil, com fundo transparente e a margem final de corte.</p>
          </div>
        </div>

        <div className="fbs-tool-card mx-4 mb-3 rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs">
          <p className="font-semibold text-primary">Medidas da fila</p>
          <p className="mt-1 text-muted-foreground">{requested.units} estampa(s) · {requested.imageAreaCm2.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} cm²</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Soma de largura × altura × quantidade. A montagem pode ser ajustada individualmente.</p>
          {hasLayout && <p className="mt-2 font-medium">Consumo da montagem: {layoutStats.lengthMeters.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} m</p>}
          {packingStrategy && <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground"><Sparkles className="h-3 w-3" /> Encaixe: {packingStrategy}</p>}
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

        <div className="px-4 py-3" aria-label="Lista de artes">
          {images.length === 0 ? (
            <div className="fbs-empty-state flex flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center">
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
        </div>
      </fieldset>

      <Separator />

      <div className="shrink-0 space-y-2 px-4 py-3">
        {images.length > 0 && (
          <p className="text-center text-[11px] text-muted-foreground">
            {images.length} arte(s) · {totalUnits} cópia(s) para empacotar
          </p>
        )}
        {packingError && <p role="alert" className="text-xs text-destructive">{packingError} Tente otimizar novamente.</p>}
        {unplacedImages.length > 0 && (
          <p className="rounded-md bg-destructive/10 px-2 py-1 text-center text-[11px] font-medium text-destructive">
            {unplacedImages.length} cópia(s) não couberam na folha atual.
          </p>
        )}
        <Button
          className="glow-primary w-full"
          disabled={images.length === 0 || isExporting || !!packingProgress}
          onClick={handleGenerateLayout}
        >
          <LayoutGrid className="h-4 w-4" />
          {packingProgress ? `Otimizando ${Math.round(packingProgress.done / packingProgress.total * 100)}%...` : 'Otimizar encaixe'}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Otimiza somente ao clicar. Compara metragem, giros e contornos, remove faixas vazias e mantém as medidas e o espaço de corte.
        </p>
        {packingProgress && <Button variant="outline" className="w-full" onClick={cancelPacking}>Cancelar otimização</Button>}
        {layoutIssues.length > 0 && <p className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300" role="status">
          {layoutIssues.some((issue) => issue.type === 'outside-sheet')
            ? 'Há uma arte fora da folha. Mova-a para dentro antes de baixar.'
            : 'Há artes sobrepostas ou com pouco espaço de corte. Confira a montagem; o download mantém tudo como está.'}
        </p>}
        <Button
          className="w-full"
          variant="secondary"
          disabled={!hasLayout || isExporting || !!packingProgress || unplacedImages.length > 0}
          onClick={handleDownload}
        >
          <Download className="h-4 w-4" />
          {isExporting ? `Exportando ${exportProgress}%...` : `Download PNG · ${dpiLabel}`}
        </Button>
        <p className="text-center text-[10px] text-muted-foreground">Área útil · PNG transparente · resolução original, mínimo 300 DPI · mantém medidas e montagem.</p>
      </div>
    </aside>
  )
}
