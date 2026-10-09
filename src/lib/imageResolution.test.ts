import { describe, expect, it } from 'vitest'
import { imageResolutionDpi } from './imageResolution'

function png(unit = 1, x = 11811, y = x) {
  const buffer = new ArrayBuffer(29), view = new DataView(buffer)
  view.setUint32(0, 0x89504e47); view.setUint32(4, 0x0d0a1a0a)
  view.setUint32(8, 9); view.setUint32(12, 0x70485973)
  view.setUint32(16, x); view.setUint32(20, y); view.setUint8(24, unit)
  return buffer
}

function exif() {
  const data = new Uint8Array(66), view = new DataView(data.buffer)
  view.setUint16(0, 0x4949); view.setUint16(2, 42, true); view.setUint32(4, 8, true)
  view.setUint16(8, 3, true)
  for (const [i, tag, pointer] of [[0, 0x11a, 50], [1, 0x11b, 58]]) {
    const offset = 10 + i * 12
    view.setUint16(offset, tag, true); view.setUint16(offset + 2, 5, true)
    view.setUint32(offset + 4, 1, true); view.setUint32(offset + 8, pointer, true)
    view.setUint32(pointer, 150, true); view.setUint32(pointer + 4, 1, true)
  }
  view.setUint16(34, 0x128, true); view.setUint16(36, 3, true)
  view.setUint32(38, 1, true); view.setUint16(42, 2, true)
  return data
}

describe('resolução física importada', () => {
  it('lê pHYs em pixels por metro, permitindo converter pixels em cm', () => {
    const dpi = imageResolutionDpi(png())!
    expect(dpi).toBeCloseTo(300, 2)
    expect(1181.1 / dpi * 2.54).toBeCloseTo(10)
  })
  it('não inventa medidas físicas com unidade desconhecida ou pixels não quadrados', () => {
    expect(imageResolutionDpi(png(0))).toBeUndefined()
    expect(imageResolutionDpi(png(1, 0))).toBeUndefined()
    expect(imageResolutionDpi(png(1, 11811, 10000))).toBeUndefined()
  })
  it('metadados ausentes, truncados ou inválidos permitem usar o tamanho sugerido', () => {
    expect(imageResolutionDpi(new ArrayBuffer(0))).toBeUndefined()
    expect(imageResolutionDpi(png().slice(0, 20))).toBeUndefined()
    const invalid = png(); new DataView(invalid).setUint32(8, 0xffffffff)
    expect(imageResolutionDpi(invalid)).toBeUndefined()
  })
  it.each([1, 2])('lê densidade JFIF na unidade %s', unit => {
    const buffer = new ArrayBuffer(22), view = new DataView(buffer), bytes = new Uint8Array(buffer)
    view.setUint16(0, 0xffd8); view.setUint16(2, 0xffe0); view.setUint16(4, 16)
    bytes.set(new TextEncoder().encode('JFIF\0'), 6); bytes[13] = unit
    view.setUint16(14, 150); view.setUint16(16, 150); view.setUint16(20, 0xffd9)
    expect(imageResolutionDpi(buffer)).toBeCloseTo(unit === 1 ? 150 : 381)
  })
  it('lê EXIF no JPEG e no WebP', () => {
    const tiff = exif(), jpeg = new Uint8Array(80), jview = new DataView(jpeg.buffer)
    jview.setUint16(0, 0xffd8); jview.setUint16(2, 0xffe1); jview.setUint16(4, 74)
    jpeg.set(new TextEncoder().encode('Exif\0\0'), 6); jpeg.set(tiff, 12)
    expect(imageResolutionDpi(jpeg.buffer)).toBe(150)
    const webp = new Uint8Array(86), wview = new DataView(webp.buffer)
    webp.set(new TextEncoder().encode('RIFF'), 0); webp.set(new TextEncoder().encode('WEBPEXIF'), 8)
    wview.setUint32(16, 66, true); webp.set(tiff, 20)
    expect(imageResolutionDpi(webp.buffer)).toBe(150)
  })
})
