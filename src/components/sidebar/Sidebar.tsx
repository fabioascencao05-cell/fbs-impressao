import { LayoutGrid, Download, LogOut, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  const generateLayout = useGangSheetStore((s) => s.generateLayout)
  const pages = useGangSheetStore((s) => s.pages)
  const { signOut } = useAuth()
  const [isExporting, setIsExporting] = useState(false)

  const hasLayout = pages.some((p) => p.items.length > 0)

  const handleGenerateLayout = () => {
    generateLayout()
    onClose?.()
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
    <aside className="glass-panel flex h-full w-full shrink-0 flex-col overflow-x-hidden border-r md:h-screen md:w-[340px]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-tight">Gang Sheet Builder</h1>
          <p className="truncate text-xs text-muted-foreground">DTF · empacotamento inteligente</p>
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
          <div className="space-y-0.5">
            <Label htmlFor="item-gap">Espaçamento entre imagens (cm)</Label>
            <Input
              id="item-gap"
              type="number"
              min={0}
              step={0.1}
              value={itemGapCm}
              onChange={(e) => setItemGapCm(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <Separator />

      <ScrollArea className="flex-1 px-4 py-3">
        {images.length === 0 ? (
          <p className="pt-6 text-center text-xs text-muted-foreground">
            Nenhuma imagem enviada ainda.
          </p>
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
