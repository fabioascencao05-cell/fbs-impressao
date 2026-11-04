import type { GangImage, PackedPage, PlacedItem } from '@/types'
import type { PackingResult } from './binPacking'

/** Repack the actual copies on the sheet, including individual size edits.
 * Queue changes clear the layout in the store. Missing copies (unplaced on the
 * previous run) still use the queue size; stale/duplicate copies are rejected.
 * Temporary source IDs let both packers keep their existing quantity contract.
 */
export function prepareRepackInput(images: GangImage[], pages: PackedPage[], unplaced: PackingResult['unplaced'] = []) {
  const sources = new Map(images.map(image => [image.id, image]))
  const copies = new Map<string, PlacedItem[]>()
  const ids = new Set<string>()
  let resized = false
  const pending = unplaced.flatMap(item => {
    const source = sources.get(item.sourceImageId)
    return item.itemId && source ? [{ ...source, ...item, id: item.itemId, xCm: 0, yCm: 0, angle: 0 }] : []
  })
  for (const item of [...pages.flatMap(page => page.items), ...pending]) {
    const source = sources.get(item.sourceImageId)
    if (!source || ids.has(item.id)) throw new Error('A montagem está desatualizada. Confira a fila antes de otimizar.')
    ids.add(item.id)
    if (![item.widthCm, item.heightCm].every(n => Number.isFinite(n) && n > 0)
      || Math.abs(item.heightCm / item.widthCm - source.aspectRatio) > source.aspectRatio * 1e-6)
      throw new Error('Uma cópia contém medidas inválidas. Corrija suas medidas antes de otimizar.')
    if (item.previewUrl !== source.previewUrl || item.contentXPx !== source.contentXPx
      || item.contentYPx !== source.contentYPx || item.contentWidthPx !== source.contentWidthPx
      || item.contentHeightPx !== source.contentHeightPx)
      throw new Error('A arte da montagem difere do original da fila. Confira a fila antes de otimizar.')
    const group = copies.get(source.id) ?? []
    group.push(item)
    copies.set(source.id, group)
    if (group.length > source.quantity) throw new Error('A quantidade da montagem difere da fila. Confira as cópias antes de otimizar.')
    if (Math.abs(item.widthCm - source.widthCm) > 1e-9 || Math.abs(item.heightCm - source.heightCm) > 1e-9) resized = true
  }
  if (!resized) return { images, pages, restore: (result: PackingResult) => result }

  const prepared: GangImage[] = []
  const identities = new Map<string, { sourceImageId: string; itemId: string }>()
  const virtualForItem = new Map<string, string>()
  for (const source of images) {
    const placed = copies.get(source.id) ?? []
    for (let copy = 0; copy < source.quantity; copy++) {
      const item = placed[copy]
      const id = JSON.stringify(['repack', source.id, copy])
      let itemId = item?.id ?? `${source.id}-${copy}`
      if (!item) {
        while (ids.has(itemId)) itemId += '-new'
        ids.add(itemId)
      }
      identities.set(id, { sourceImageId: source.id, itemId })
      if (item) virtualForItem.set(item.id, id)
      prepared.push({ ...source, id, quantity: 1,
        widthCm: item?.widthCm ?? source.widthCm, heightCm: item?.heightCm ?? source.heightCm })
    }
  }
  return {
    images: prepared,
    pages: pages.map(page => ({ ...page, items: page.items.map(item => {
      const id = virtualForItem.get(item.id)!
      return { ...item, id: `${id}-0`, sourceImageId: id }
    }) })),
    restore: (result: PackingResult): PackingResult => ({ ...result,
      pages: result.pages.map(page => ({ ...page, items: page.items.map(item => {
        const identity = identities.get(item.sourceImageId)!
        return { ...item, id: identity.itemId, sourceImageId: identity.sourceImageId }
      }) })),
      unplaced: result.unplaced.map(item => ({ ...item, sourceImageId: identities.get(item.sourceImageId)!.sourceImageId,
        itemId: identities.get(item.sourceImageId)!.itemId })),
    }),
  }
}
