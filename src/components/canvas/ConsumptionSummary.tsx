import { useMemo } from 'react'
import { useGangSheetStore } from '@/store/useGangSheetStore'
import { calculateConsumption } from '@/lib/consumption'

const number = (value: number, digits = 2) => value.toLocaleString('pt-BR', { maximumFractionDigits: digits })

export default function ConsumptionSummary() {
  const pages = useGangSheetStore(s => s.pages)
  const width = useGangSheetStore(s => s.canvasWidthCm)
  const price = useGangSheetStore(s => s.costPerMeter)
  const pending = useGangSheetStore(s => !!s.packingProgress)
  const unplaced = useGangSheetStore(s => s.unplacedImages.length)
  const hasImages = useGangSheetStore(s => s.images.length > 0)
  const stats = useMemo(() => calculateConsumption(pages, width, price), [pages, width, price])
  const waiting = pending || (hasImages && !stats.units)
  const values = [
    ['Total de estampas', number(stats.units, 0)],
    ['Área total das imagens', `${number(stats.imageAreaCm2)} cm²`],
    ['Metragem realmente consumida', `${number(stats.lengthMeters, 4)} m`],
    ['Aproveitamento', `${number(stats.efficiency, 1)}%`],
    ['Custo real em R$', stats.cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })],
  ]
  return (
    <section aria-label="Consumo real de DTF" aria-busy={pending} className="shrink-0 border-b bg-card/90 px-3 py-3 md:px-5">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {values.map(([label, value]) => <div key={label}>
          <dt className="text-[10px] leading-tight text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm font-bold tabular-nums text-primary md:text-base">{waiting ? '—' : value}</dd>
        </div>)}
      </dl>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground" role="status">
        {waiting ? (pending ? 'Recalculando o encaixe e o consumo…' : 'Otimize o encaixe para calcular o consumo.')
          : `Desperdício estimado: ${number(stats.wasteAreaCm2)} cm² (${number(stats.units ? 100 - stats.efficiency : 0, 1)}%). Área das imagens = largura × altura; aproveitamento e desperdício estimados pelos contornos. Margem final: 0,1 cm por folha.`}
        {unplaced > 0 && ` Atenção: ${unplaced} estampa(s) sem posição. Valores parciais, somente das estampas posicionadas.`}
      </p>
    </section>
  )
}
