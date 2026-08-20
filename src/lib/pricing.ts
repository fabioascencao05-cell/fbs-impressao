/** Calculates linear-film cost from the used sheet height. */
export function calculateFilmCost(usedHeightCm: number, pricePerMeter: number): number {
  if (!Number.isFinite(usedHeightCm) || !Number.isFinite(pricePerMeter)) return 0
  return (Math.max(0, usedHeightCm) / 100) * Math.max(0, pricePerMeter)
}
