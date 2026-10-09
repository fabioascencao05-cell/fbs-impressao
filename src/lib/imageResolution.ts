// Read physical density without decoding/resampling the art. Missing or invalid
// density is explicitly shown as a 300 DPI suggestion in the upload queue.
function squareDpi(x: number, y: number): number | undefined {
  return Number.isFinite(x) && x > 0 && Math.abs(x - y) < 0.1 ? x : undefined
}

function exifDpi(bytes: Uint8Array): number | undefined {
  const start = String.fromCharCode(...bytes.slice(0, 4)) === 'Exif' ? 6 : 0
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, bytes.length - start)
  const little = view.getUint16(0) === 0x4949
  if ((!little && view.getUint16(0) !== 0x4d4d) || view.getUint16(2, little) !== 42) return
  const ifd = view.getUint32(4, little)
  const count = view.getUint16(ifd, little)
  let x = 0, y = 0, unit = 2
  for (let index = 0; index < count; index++) {
    const offset = ifd + 2 + index * 12
    const tag = view.getUint16(offset, little), type = view.getUint16(offset + 2, little)
    if (view.getUint32(offset + 4, little) !== 1) continue
    if (tag === 0x128 && type === 3) unit = view.getUint16(offset + 8, little)
    if ((tag === 0x11a || tag === 0x11b) && type === 5) {
      const pointer = view.getUint32(offset + 8, little)
      const value = view.getUint32(pointer, little) / view.getUint32(pointer + 4, little)
      if (tag === 0x11a) x = value
      else y = value
    }
  }
  return unit === 2 ? squareDpi(x, y) : unit === 3 ? squareDpi(x * 2.54, y * 2.54) : undefined
}

export function imageResolutionDpi(buffer: ArrayBuffer): number | undefined {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer)
  const text = (offset: number, size: number) => String.fromCharCode(...bytes.slice(offset, offset + size))
  try {
    if (view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
      // PNG pHYs: densities are pixels/metre only when the unit byte is 1.
      for (let offset = 8; offset + 12 <= bytes.length;) {
        const size = view.getUint32(offset), type = text(offset + 4, 4)
        if (offset + size + 12 > bytes.length) return
        if (type === 'pHYs' && size === 9 && bytes[offset + 16] === 1)
          return squareDpi(view.getUint32(offset + 8) * 0.0254, view.getUint32(offset + 12) * 0.0254)
        if (type === 'IDAT') return
        offset += size + 12
      }
    } else if (view.getUint16(0) === 0xffd8) {
      let jfif: number | undefined
      for (let offset = 2; offset + 4 <= bytes.length;) {
        if (bytes[offset] !== 0xff) break
        const marker = bytes[offset + 1]
        if (marker === 0xda || marker === 0xd9) break
        const size = view.getUint16(offset + 2), data = offset + 4
        if (size < 2 || offset + size + 2 > bytes.length) break
        if (marker === 0xe0 && size >= 16 && text(data, 5) === 'JFIF\0') {
          const unit = bytes[data + 7], factor = unit === 1 ? 1 : unit === 2 ? 2.54 : 0
          jfif = squareDpi(view.getUint16(data + 8) * factor, view.getUint16(data + 10) * factor)
        }
        if (marker === 0xe1 && text(data, 6) === 'Exif\0\0') {
          const dpi = exifDpi(bytes.subarray(data, offset + size + 2))
          if (dpi) return dpi
        }
        offset += size + 2
      }
      return jfif
    } else if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
      for (let offset = 12; offset + 8 <= bytes.length;) {
        const size = view.getUint32(offset + 4, true)
        if (offset + size + 8 > bytes.length) return
        if (text(offset, 4) === 'EXIF') return exifDpi(bytes.subarray(offset + 8, offset + 8 + size))
        offset += 8 + size + size % 2
      }
    }
  } catch { /* Truncated/malformed metadata must not prevent a valid image upload. */ }
  return undefined
}

export async function readImageResolutionDpi(file: File): Promise<number | undefined> {
  if (file.type === 'image/svg+xml') return undefined
  return imageResolutionDpi(await file.arrayBuffer())
}
