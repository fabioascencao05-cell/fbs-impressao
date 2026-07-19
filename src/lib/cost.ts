import type { PackedPage } from '@/types'

// DTF film is sold by the linear meter: 1 linear meter = 57 cm wide x 100 cm long.
export const STANDARD_ROLL_WIDTH_CM = 57
export const LINEAR_METER_CM = 100

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const METERS = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatBRL(value: number): string {
  return BRL.format(Number.isFinite(value) ? value : 0)
}

export function formatMeters(value: number): string {
  return `${METERS.format(Number.isFinite(value) ? value : 0)} m`
}

/**
 * Total film consumed by the current layout, charged the way the market does:
 * by LINEAR LENGTH. We sum the really-used length of every page (up to the last
 * art, not the max sheet height) and multiply by the price per linear meter.
 * Width is not pro-rated because a roll is bought at its full 57 cm width
 * regardless of how much of it you fill.
 */
export function computeLayoutCost(
  pages: PackedPage[],
  pricePerLinearMeter: number
): { totalLengthCm: number; linearMeters: number; cost: number } {
  const totalLengthCm = pages.reduce((sum, p) => sum + Math.max(0, p.usedHeightCm), 0)
  const linearMeters = totalLengthCm / LINEAR_METER_CM
  const cost = linearMeters * Math.max(0, pricePerLinearMeter)
  return { totalLengthCm, linearMeters, cost }
}
