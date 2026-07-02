import { LayoutGrid, Download, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import ImageUploadZone from './ImageUploadZone'
import ImageQueueItem from './ImageQueueItem'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import { CANVAS_WIDTH_CM } from '@/lib/constants'
import { downloadGangSheets } from '@/lib/exportCanvas'
import { useAuth } from '@/hooks/useAuth'
import { useState } from 'react'

export default function Sidebar() {
  const images = useGangSheetStore((s) => s.images)
  const maxHeightCm = useGangSheetStore((s) => s.maxHeightCm)
  const setMaxHeightCm = useGangSheetStore((s) => s.setMaxHeightCm)
  const generateLayout = useGangSheetStore((s) => s.generateLayout)
  const pages = useGangSheetStore((s) => s.pages)
  const { signOut } = useAuth()
  const [isExporting, setIsExporting] = useState(false)

  const hasLayout = pages.some((p) => p.items.length > 0)

  const handleDownload = async () => {
    setIsExporting(true)
    try {
      await downloadGangSheets(pages, maxHeightCm)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <aside className="flex h-screen w-[340px] shrink-0 flex-col border-r bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold leading-tight">Gang Sheet Builder</h1>
          <p className="text-xs text-muted-foreground">DTF · Largura fixa {CANVAS_WIDTH_CM}cm</p>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 px-4 py-3">
        <ImageUploadZone />

        <div className="space-y-0.5">
          <Label htmlFor="max-height">Altura Máxima da Folha (cm)</Label>
          <Input
            id="max-height"
            type="number"
            min={1}
            value={maxHeightCm}
            onChange={(e) => setMaxHeightCm(Number(e.target.value))}
          />
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
        <Button className="w-full" disabled={images.length === 0} onClick={generateLayout}>
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
