/// <reference lib="webworker" />
import { packImagesByShape, type PackOptions, type PackUnitInput } from './shapePacking'
import type { PackedPage } from '@/types'

export interface PackRequest {
  units: PackUnitInput[]
  options: PackOptions
  useShape: boolean
}

export type PackResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; pages: PackedPage[] }
  | { type: 'error'; message: string }

self.onmessage = (e: MessageEvent<PackRequest>) => {
  const { units, options, useShape } = e.data
  try {
    const pages = packImagesByShape(
      units,
      options,
      (p) => {
        const msg: PackResponse = { type: 'progress', done: p.done, total: p.total }
        ;(self as unknown as Worker).postMessage(msg)
      },
      useShape
    )
    const msg: PackResponse = { type: 'done', pages }
    ;(self as unknown as Worker).postMessage(msg)
  } catch (err) {
    const msg: PackResponse = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Erro no empacotamento.',
    }
    ;(self as unknown as Worker).postMessage(msg)
  }
}
