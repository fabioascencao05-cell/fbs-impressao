import type { PackedPage, PlacedItem } from '@/types'

/** Fail closed: never trade away source resolution to fit a browser limit. */
export function planExport(page: PackedPage, widthCm: number, heightCm: number) {
  if (![widthCm, heightCm].every((n) => Number.isFinite(n) && n > 0)) throw new Error('Medidas de folha inválidas.')
  let pxPerCm = 300 / 2.54
  for (const item of page.items) {
    if (![item.widthCm, item.heightCm, item.contentWidthPx, item.contentHeightPx].every((n) => Number.isFinite(n) && n > 0)
      || ![item.xCm, item.yCm, item.angle].every(Number.isFinite)) throw new Error('Uma arte contém medidas inválidas. Gere a montagem novamente.')
    const sx = item.widthCm / item.contentWidthPx
    const sy = item.heightCm / item.contentHeightPx
    if (Math.abs(sx - sy) > Math.max(sx, sy) * 0.000001) throw new Error('Uma arte está fora da proporção original. Gere a montagem novamente antes de baixar.')
    pxPerCm = Math.max(pxPerCm, 1 / sx, 1 / sy)
  }
  // PNG stores integer pixels/metre. Round upward so metadata and drawing agree.
  const pixelsPerMeter = Math.ceil(pxPerCm * 100)
  pxPerCm = pixelsPerMeter / 100
  const widthPx = Math.ceil(widthCm * pxPerCm)
  const heightPx = Math.ceil(heightCm * pxPerCm)
  if (widthPx > 32767 || heightPx > 32767 || widthPx * heightPx > 100000000) {
    throw new Error('A resolução original desta folha ultrapassa o limite seguro do navegador. Nenhuma qualidade foi reduzida. Divida a montagem em páginas menores; se uma única arte exceder o limite, use um programa de impressão dedicado.')
  }
  return { pxPerCm, dpi: pixelsPerMeter * 0.0254, widthPx, heightPx }
}

/** Only editable geometry may change, and both axes always share one scale. */
export function proportionatePatch(item: PlacedItem, patch: Partial<PlacedItem>): PlacedItem {
  const widthCm = patch.widthCm ?? (patch.heightCm === undefined ? item.widthCm : patch.heightCm * item.contentWidthPx / item.contentHeightPx)
  const next = { ...item, widthCm, heightCm: widthCm * item.contentHeightPx / item.contentWidthPx,
    xCm: patch.xCm ?? item.xCm, yCm: patch.yCm ?? item.yCm, angle: patch.angle ?? item.angle }
  return [next.widthCm, next.heightCm].every((n) => Number.isFinite(n) && n > 0)
    && [next.xCm, next.yCm, next.angle].every(Number.isFinite) ? next : item
}
