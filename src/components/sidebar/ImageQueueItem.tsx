import { Trash2 } from 'lucide-react'
import { NumberField } from '@/components/ui/number-field'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import type { GangImage } from '@/types'

export default function ImageQueueItem({ image }: { image: GangImage }) {
  const updateQuantity = useGangSheetStore((s) => s.updateQuantity)
  const updateWidthCm = useGangSheetStore((s) => s.updateWidthCm)
  const removeImage = useGangSheetStore((s) => s.removeImage)

  return (
    <div className="flex min-w-0 gap-3 rounded-lg border bg-card/60 p-2.5 transition-colors hover:border-primary/40">
      <img
        src={image.previewUrl}
        alt={image.file.name}
        className="h-14 w-14 shrink-0 rounded-md border object-contain bg-[conic-gradient(#f0f0f0_0deg_90deg,#fff_90deg_180deg,#f0f0f0_180deg_270deg,#fff_270deg_360deg)] bg-[length:10px_10px]"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-medium" title={image.file.name}>
            {image.file.name}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeImage(image.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor={`qty-${image.id}`}>Quantidade</Label>
            <NumberField
              id={`qty-${image.id}`}
              min={1}
              value={image.quantity}
              onCommit={(n) => updateQuantity(image.id, n)}
            />
          </div>
          <div className="min-w-0 space-y-0.5">
            <Label htmlFor={`width-${image.id}`} className="truncate">
              Largura (cm)
            </Label>
            <NumberField
              id={`width-${image.id}`}
              min={0.1}
              step={0.1}
              value={image.widthCm}
              onCommit={(n) => updateWidthCm(image.id, n)}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Altura: {image.heightCm.toFixed(1)} cm · {image.naturalWidthPx}×{image.naturalHeightPx}px
        </p>
      </div>
    </div>
  )
}
