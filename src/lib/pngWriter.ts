const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let crc = n
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  return crc >>> 0
})

export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(data.length + 12)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) chunk[i + 4] = type.charCodeAt(i)
  chunk.set(data, 8)
  let crc = 0xffffffff
  for (let i = 4; i < chunk.length - 4; i++) crc = CRC_TABLE[(crc ^ chunk[i]) & 255] ^ (crc >>> 8)
  view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0)
  return chunk
}

/** One PNG/zlib stream; strips never become separate files or separate images. */
export async function encodeRgbaPng(
  width: number,
  height: number,
  dpi: number,
  strips: AsyncIterable<{ rgba: Uint8ClampedArray; rows: number }>
): Promise<Blob> {
  if (typeof CompressionStream === 'undefined')
    throw new Error('Atualize o navegador para exportar PNG contínuo na resolução original.')
  const header = new Uint8Array(13)
  const headerView = new DataView(header.buffer)
  headerView.setUint32(0, width)
  headerView.setUint32(4, height)
  header[8] = 8 // 8 bits/channel
  header[9] = 6 // RGBA: preserve transparency and source RGB
  const density = new Uint8Array(9)
  const densityView = new DataView(density.buffer)
  densityView.setUint32(0, Math.round(dpi / 0.0254))
  densityView.setUint32(4, Math.round(dpi / 0.0254))
  density[8] = 1
  const parts: BlobPart[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('sRGB', new Uint8Array([0])), pngChunk('pHYs', density)]
  const compression = new CompressionStream('deflate')
  const writer = compression.writable.getWriter()
  const reader = compression.readable.getReader()
  // Drain concurrently: waiting until all strips are written can deadlock on
  // stream backpressure, especially for long/high-entropy artwork.
  const reading = (async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      parts.push(pngChunk('IDAT', value))
    }
  })()
  void reading.catch(() => {})
  let writtenRows = 0
  try {
    const rowBytes = width * 4
    for await (const { rgba, rows } of strips) {
      if (rows < 1 || rgba.length !== rowBytes * rows || writtenRows + rows > height)
        throw new Error('Falha ao gerar as linhas do PNG. Nenhum arquivo parcial foi baixado.')
      const scanlines = new Uint8Array((rowBytes + 1) * rows)
      for (let row = 0; row < rows; row++)
        scanlines.set(rgba.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1)
      await writer.write(scanlines)
      writtenRows += rows
    }
    if (writtenRows !== height) throw new Error('A exportação ficou incompleta. Tente baixar novamente.')
    await writer.close()
    await reading
  } catch (error) {
    await Promise.allSettled([writer.abort(error), reader.cancel(error), reading])
    throw error
  }
  parts.push(pngChunk('IEND', new Uint8Array()))
  return new Blob(parts, { type: 'image/png' })
}
