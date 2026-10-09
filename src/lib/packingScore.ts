import type { PackedPage } from '@/types'
import { consumedLengthCm } from './consumption'

/** Film is billed by used length. Fewer files is only a tie-breaker. */
export function packingScore(result: { pages: PackedPage[]; unplaced: unknown[] }): number[] {
  return [result.unplaced.length,
    result.pages.reduce((length, page) => length + consumedLengthCm(page.items), 0),
    result.pages.filter(page => page.items.length > 0).length]
}
