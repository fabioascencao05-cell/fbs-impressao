export interface ContentBox {
  xPx: number
  yPx: number
  widthPx: number
  heightPx: number
  naturalWidthPx: number
  naturalHeightPx: number
}

// Scanning at full resolution is wasteful for large prints; a small
// downsampled copy is enough to locate the bounding box of visible pixels.
const SCAN_MAX_SIDE = 512

/**
 * Finds the tight bounding box of non-transparent pixels in a PNG, so the
 * packer can treat the actual artwork size instead of the file's full
 * (often padded) canvas. Falls back to the full image if nothing is
 * detected (e.g. a fully transparent file).
 */
export function computeContentBox(file: File): Promise<ContentBox> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const naturalWidthPx = img.naturalWidth
      const naturalHeightPx = img.naturalHeight

      const scale = Math.min(1, SCAN_MAX_SIDE / Math.max(naturalWidthPx, naturalHeightPx))
      const scanWidth = Math.max(1, Math.round(naturalWidthPx * scale))
      const scanHeight = Math.max(1, Math.round(naturalHeightPx * scale))

      const canvas = document.createElement('canvas')
      canvas.width = scanWidth
      canvas.height = scanHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        resolve(fullBox(naturalWidthPx, naturalHeightPx))
        return
      }
      ctx.drawImage(img, 0, 0, scanWidth, scanHeight)

      let data: Uint8ClampedArray
      try {
        data = ctx.getImageData(0, 0, scanWidth, scanHeight).data
      } catch {
        resolve(fullBox(naturalWidthPx, naturalHeightPx))
        return
      }

      let minX = scanWidth
      let minY = scanHeight
      let maxX = -1
      let maxY = -1

      for (let y = 0; y < scanHeight; y++) {
        for (let x = 0; x < scanWidth; x++) {
          const alpha = data[(y * scanWidth + x) * 4 + 3]
          if (alpha > 0) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }

      if (maxX < minX || maxY < minY) {
        resolve(fullBox(naturalWidthPx, naturalHeightPx))
        return
      }

      const invScale = 1 / scale
      resolve({
        xPx: Math.max(0, Math.floor(minX * invScale)),
        yPx: Math.max(0, Math.floor(minY * invScale)),
        widthPx: Math.min(naturalWidthPx, Math.ceil((maxX - minX + 1) * invScale)),
        heightPx: Math.min(naturalHeightPx, Math.ceil((maxY - minY + 1) * invScale)),
        naturalWidthPx,
        naturalHeightPx,
      })
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

function fullBox(naturalWidthPx: number, naturalHeightPx: number): ContentBox {
  return {
    xPx: 0,
    yPx: 0,
    widthPx: naturalWidthPx,
    heightPx: naturalHeightPx,
    naturalWidthPx,
    naturalHeightPx,
  }
}
