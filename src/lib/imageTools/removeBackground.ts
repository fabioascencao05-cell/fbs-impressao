// Background removal runs in the browser so customer artwork is not uploaded
// to a third-party service.  The first use downloads an ONNX model and reports
// its progress; subsequent uses are served from the browser cache.

export type BackgroundQuality = 'quality' | 'fast'

export interface RemoveBgProgress {
  ratio?: number
  stage: string
}

export interface RemoveBackgroundOptions {
  quality?: BackgroundQuality
  onProgress?: (progress: RemoveBgProgress) => void
}

function describeProgress(key: string, current: number, total: number): RemoveBgProgress {
  const ratio = total > 0 ? Math.max(0, Math.min(1, current / total)) : undefined
  if (key.startsWith('fetch') || key.includes('model')) return { ratio, stage: 'Preparando o modelo de recorte…' }
  if (key.includes('wasm')) return { ratio, stage: 'Preparando o processamento…' }
  return { ratio, stage: 'Separando a arte do fundo…' }
}

/**
 * Removes the image background with a compatibility fallback. The worker path
 * is fast on modern devices; if a browser blocks it, retrying on the main
 * thread keeps the tool usable instead of leaving the Studio frozen.
 */
export async function removeBackground(input: Blob, options: RemoveBackgroundOptions = {}): Promise<Blob> {
  const { removeBackground: run } = await import('@imgly/background-removal')
  const quality = options.quality ?? 'quality'
  const configuration = {
    // isnet_fp16 prioritizes clean hair/letter edges; quint8 is much lighter
    // for phones and older computers.
    model: quality === 'fast' ? ('isnet_quint8' as const) : ('isnet_fp16' as const),
    device: 'cpu' as const,
    output: { format: 'image/png' as const },
    progress: (key: string, current: number, total: number) => options.onProgress?.(describeProgress(key, current, total)),
  }

  try {
    return await run(input, { ...configuration, proxyToWorker: true })
  } catch (firstError) {
    options.onProgress?.({ stage: 'Ativando modo compatível…' })
    try {
      return await run(input, { ...configuration, proxyToWorker: false })
    } catch {
      const reason = firstError instanceof Error ? firstError.message : 'erro desconhecido'
      throw new Error(`Não foi possível remover o fundo neste navegador. ${reason}`)
    }
  }
}
