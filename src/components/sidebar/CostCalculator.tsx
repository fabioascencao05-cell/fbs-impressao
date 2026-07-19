import { useMemo, useState } from 'react'
import { Calculator, Ruler as RulerIcon, Wallet } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import { computeLayoutCost, formatBRL, formatMeters, STANDARD_ROLL_WIDTH_CM } from '@/lib/cost'

export default function CostCalculator() {
  const pages = useGangSheetStore((s) => s.pages)
  const canvasWidthCm = useGangSheetStore((s) => s.canvasWidthCm)
  const pricePerLinearMeter = useGangSheetStore((s) => s.pricePerLinearMeter)
  const setPricePerLinearMeter = useGangSheetStore((s) => s.setPricePerLinearMeter)

  const [manualMeters, setManualMeters] = useState('')

  const { linearMeters, cost } = useMemo(
    () => computeLayoutCost(pages, pricePerLinearMeter),
    [pages, pricePerLinearMeter]
  )

  const manual = Number(manualMeters.replace(',', '.'))
  const manualCost = Number.isFinite(manual) && manual > 0 ? manual * pricePerLinearMeter : 0
  const widthNote =
    canvasWidthCm !== STANDARD_ROLL_WIDTH_CM
      ? `Folha em ${canvasWidthCm} cm de largura — o rolo é cobrado pela largura cheia (${STANDARD_ROLL_WIDTH_CM} cm), então o custo é pelo comprimento linear.`
      : `Padrão: 1 metro linear = ${STANDARD_ROLL_WIDTH_CM} cm × 100 cm. Cobrança pelo comprimento usado.`

  return (
    <div className="space-y-2.5 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] to-accent/[0.05] p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Calculator className="h-3.5 w-3.5" />
        Custo do DTF
      </div>

      <div className="space-y-0.5">
        <Label htmlFor="price-meter" title={widthNote}>
          Valor do metro linear (R$)
        </Label>
        <Input
          id="price-meter"
          type="number"
          min={0}
          step={0.5}
          value={pricePerLinearMeter || ''}
          placeholder="Ex: 45,00"
          onChange={(e) => setPricePerLinearMeter(Number(e.target.value))}
        />
      </div>

      {/* Auto cost of the current layout. */}
      <div
        className="rounded-lg border border-primary/25 bg-background/50 p-2.5 backdrop-blur-sm"
        title={widthNote}
      >
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <RulerIcon className="h-3 w-3" />
            Metros lineares
          </span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatMeters(linearMeters)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Wallet className="h-3 w-3" />
            Custo estimado
          </span>
          <span className="gradient-text text-lg font-bold tabular-nums">{formatBRL(cost)}</span>
        </div>
      </div>

      {/* Manual mini-calculator. */}
      <div className="space-y-1 rounded-lg border bg-muted/30 p-2.5">
        <Label htmlFor="manual-meters" className="text-[10px]">
          Calcular manualmente (metros)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="manual-meters"
            type="number"
            min={0}
            step={0.1}
            value={manualMeters}
            placeholder="Ex: 2"
            onChange={(e) => setManualMeters(e.target.value)}
            className="h-8"
          />
          <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
            {formatBRL(manualCost)}
          </span>
        </div>
      </div>
    </div>
  )
}
