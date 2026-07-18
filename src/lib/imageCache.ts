// Decoded <img> elements keyed by their (blob) URL. The canvas editor rebuilds
// its Fabric objects on every zoom/move/resize; without this cache each rebuild
// would re-fetch and re-decode the same blob URL, which is the dominant cost
// when dragging art around. Decoding once and reusing the element keeps edits
// snappy. The same cache feeds the exporter so export doesn't decode again.
const cache = new Map<string, Promise<HTMLImageElement>>()

export function loadImageElement(url: string): Promise<HTMLImageElement> {
  const existing = cache.get(url)
  if (existing) return existing

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => {
      // Don't keep a rejected promise cached — a later retry should re-attempt.
      cache.delete(url)
      reject(new Error('Falha ao carregar imagem.'))
    }
    img.src = url
  })

  cache.set(url, promise)
  return promise
}

/** Drop a cached element when its underlying blob URL is about to be revoked. */
export function releaseImageElement(url: string) {
  cache.delete(url)
}
