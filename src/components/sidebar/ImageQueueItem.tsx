import { useState } from 'react'
import { ChevronDown, Minus, Plus, Ruler, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import type { GangImage } from '@/types'

const TYPE_LABELS: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/webp': 'WebP',
}

const fmtCm = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export default function ImageQueueItem({ image }: { image: GangImage }) {
  const updateQuantity = useGangSheetStore((s) => s.updateQuantity)
  const updateWidthCm = useGangSheetStore((s) => s.updateWidthCm)
  const updateHeightCm = useGangSheetStore((s) => s.updateHeightCm)
  const removeImage = useGangSheetStore((s) => s.removeImage)
  const [expanded, setExpanded] = useState(false)

  const typeLabel = TYPE_LABELS[image.file.type] ?? 'IMG'

  return (
    <div className="min-w-0 rounded-lg border bg-card/60 p-2.5 transition-colors hover:border-primary/40">
      <div className="flex min-w-0 gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title="Clique para editar as medidas"
          className="group relative shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={image.previewUrl}
            alt={image.file.name}
            className="h-14 w-14 rounded-md border object-contain bg-[conic-gradient(#f0f0f0_0deg_90deg,#fff_90deg_180deg,#f0f0f0_180deg_270deg,#fff_270deg_360deg)] bg-[length:10px_10px]"
          />
          <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
            <Ruler className="h-4 w-4 text-white" />
          </span>
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <Badge
                variant="secondary"
                className="shrink-0 px-1.5 py-0 text-[10px] font-semibold tracking-wide"
              >
                {typeLabel}
              </Badge>
              <p className="truncate text-xs font-medium" title={image.file.name}>
                {image.file.name}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
              title="Remover imagem"
              onClick={() => removeImage(image.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <p className="truncate text-[11px] text-muted-foreground">
            Resolução: {image.naturalWidthPx}×{image.naturalHeightPx} px
          </p>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex min-w-0 items-center gap-1 rounded text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Clique para editar as medidas"
            >
              <Ruler className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {fmtCm(image.widthCm)} × {fmtCm(image.heightCm)} cm
              </span>
              <ChevronDown
                className={cn('h-3 w-3 shrink-0 transition-transform', expanded && 'rotate-180')}
              />
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6"
                title="Diminuir quantidade"
                disabled={image.quantity <= 1}
                onClick={() => updateQuantity(image.id, image.quantity - 1)}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-7 text-center text-xs font-semibold tabular-nums">
                {image.quantity}×
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6"
                title="Aumentar quantidade"
                onClick={() => updateQuantity(image.id, image.quantity + 1)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1.5 rounded-md border bg-muted/40 p-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor={`width-${image.id}`}>Largura (cm)</Label>
              <Input
                id={`width-${image.id}`}
                type="number"
                min={0.1}
                step={0.1}
                value={image.widthCm}
                onChange={(e) => updateWidthCm(image.id, Number(e.target.value))}
              />
            </div>
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor={`height-${image.id}`}>Altura (cm)</Label>
              <Input
                id={`height-${image.id}`}
                type="number"
                min={0.1}
                step={0.1}
                value={image.heightCm}
                onChange={(e) => updateHeightCm(image.id, Number(e.target.value))}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Proporção travada — ajustar um lado recalcula o outro.
          </p>
        </div>
      )}
    </div>
  )
}
