export interface ContentBox {
  xPx: number
  yPx: number
  widthPx: number
  heightPx: number
  naturalWidthPx: number
  naturalHeightPx: number
}

/** Scan original-resolution tiles so fine alpha lines cannot vanish in a thumbnail. */
export function computeContentBox(file: File): Promise<ContentBox> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const sourceUrl = URL.createObjectURL(file)
    img.onload = async () => {
      const naturalWidthPx = img.naturalWidth
      const naturalHeightPx = img.naturalHeight
      const full = { xPx: 0, yPx: 0, widthPx: naturalWidthPx, heightPx: naturalHeightPx, naturalWidthPx, naturalHeightPx }
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1024
      try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) { resolve(full); return }
        let minX = naturalWidthPx, minY = naturalHeightPx, maxX = -1, maxY = -1
        for (let top = 0; top < naturalHeightPx; top += 1024) {
          for (let left = 0; left < naturalWidthPx; left += 1024) {
            const w = Math.min(1024, naturalWidthPx - left)
            const h = Math.min(1024, naturalHeightPx - top)
            ctx.clearRect(0, 0, 1024, 1024)
            ctx.drawImage(img, left, top, w, h, 0, 0, w, h)
            const data = ctx.getImageData(0, 0, w, h).data
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
              if (data[(y * w + x) * 4 + 3] === 0) continue
              minX = Math.min(minX, left + x); maxX = Math.max(maxX, left + x)
              minY = Math.min(minY, top + y); maxY = Math.max(maxY, top + y)
            }
          }
          await new Promise((done) => setTimeout(done, 0))
        }
        resolve(maxX < minX ? full : { ...full, xPx: minX, yPx: minY, widthPx: maxX - minX + 1, heightPx: maxY - minY + 1 })
      } catch {
        resolve(full) // Retain all pixels when scanning fails; never guess a crop.
      } finally {
        canvas.width = canvas.height = 0
        URL.revokeObjectURL(sourceUrl)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(sourceUrl)
      reject(new Error(`Não foi possível ler ${file.name}.`))
    }
    img.src = sourceUrl
  })
}
