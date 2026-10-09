import { rotatedAabbCm } from './geometry'
import type { PlacedItem } from '@/types'

export interface ArtDrag {
  pageIndex: number
  itemId: string
  clientX: number
  clientY: number
  grabXCm: number
  grabYCm: number
}

export function clampPlacement(item: PlacedItem, xCm: number, yCm: number, widthCm: number, heightCm: number) {
  const box = rotatedAabbCm(item.widthCm, item.heightCm, item.angle)
  if (![xCm, yCm, box.wCm, box.hCm].every(Number.isFinite)
    || box.wCm > widthCm + 1e-6 || box.hCm > heightCm + 1e-6) return null
  return { xCm: Math.max(0, Math.min(xCm, widthCm - box.wCm)),
    yCm: Math.max(0, Math.min(yCm, heightCm - box.hCm)) }
}

export function dropPlacement(item: PlacedItem, drag: ArtDrag,
  rect: { left: number; top: number; width: number; height: number },
  widthCm: number, heightCm: number) {
  if (drag.clientX < rect.left || drag.clientX > rect.left + rect.width
    || drag.clientY < rect.top || drag.clientY > rect.top + rect.height) return null
  return clampPlacement(item,
    (drag.clientX - rect.left) / rect.width * widthCm - drag.grabXCm,
    (drag.clientY - rect.top) / rect.height * heightCm - drag.grabYCm, widthCm, heightCm)
}

/** A convenient free position for the page selector, without repacking others. */
export function findPageSpace(item: PlacedItem, items: PlacedItem[], width: number, height: number, gap: number) {
  const box = rotatedAabbCm(item.widthCm, item.heightCm, item.angle)
  const occupied = items.map(other => ({ x: other.xCm, y: other.yCm,
    ...rotatedAabbCm(other.widthCm, other.heightCm, other.angle) }))
  const xs = [...new Set([0, ...occupied.map(other => other.x + other.wCm + gap)])].sort((a, b) => a - b)
  const ys = [...new Set([0, ...occupied.map(other => other.y + other.hCm + gap)])].sort((a, b) => a - b)
  for (const yCm of ys) for (const xCm of xs) {
    if (xCm + box.wCm > width + 1e-6 || yCm + box.hCm > height + 1e-6) continue
    if (occupied.every(other => xCm + box.wCm + gap <= other.x + 1e-6
      || other.x + other.wCm + gap <= xCm + 1e-6
      || yCm + box.hCm + gap <= other.y + 1e-6
      || other.y + other.hCm + gap <= yCm + 1e-6)) return { xCm, yCm }
  }
  return null
}
