import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import { encodeRgbaPng } from './pngWriter'

async function chunks(blob: Blob) {
  const bytes = Buffer.from(await blob.arrayBuffer())
  const result: Array<{ type: string; data: Buffer }> = []
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset)
    result.push({ type: bytes.toString('ascii', offset + 4, offset + 8), data: bytes.subarray(offset + 8, offset + 8 + size) })
    offset += size + 12
  }
  return result
}

describe('PNG contínuo a 300 DPI', () => {
  it('preserva RGB e alfa entre faixas, em um único PNG com metadados corretos', async () => {
    const first = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0])
    const last = new Uint8ClampedArray([0, 255, 0, 128, 0, 0, 255, 255])
    async function* strips() {
      yield { rgba: first, rows: 1 }
      yield { rgba: last, rows: 1 }
    }
    const result = await chunks(await encodeRgbaPng(2, 2, 300, strips()))
    const header = result.find((chunk) => chunk.type === 'IHDR')!.data
    expect(header.readUInt32BE(0)).toBe(2)
    expect(header.readUInt32BE(4)).toBe(2)
    expect(header[9]).toBe(6) // RGBA
    const density = result.find((chunk) => chunk.type === 'pHYs')!.data
    expect(density.readUInt32BE(0)).toBe(11811)
    expect(density.readUInt32BE(4)).toBe(11811)
    expect(density[8]).toBe(1)
    const raw = inflateSync(Buffer.concat(result.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data)))
    expect(raw).toEqual(Buffer.from([0, ...first, 0, ...last]))
    expect(result.filter((chunk) => chunk.type === 'IHDR')).toHaveLength(1)
    expect(result.at(-1)!.type).toBe('IEND')
  })

  it('recusa uma exportação incompleta em vez de baixar arquivo parcial', async () => {
    async function* strips() { yield { rgba: new Uint8ClampedArray(4), rows: 1 } }
    await expect(encodeRgbaPng(1, 2, 300, strips())).rejects.toThrow('incompleta')
  })
})
