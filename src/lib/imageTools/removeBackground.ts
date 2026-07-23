// Background removal that runs entirely in the browser — no server, no API key,
// no per-image cost. Uses @imgly/background-removal (an IS-Net/U²-Net ONNX model
// executed via WASM). The model assets (~40MB) download once and are cached by
// the browser, after which it works offline.
//
// The heavy library is loaded on demand so it never weighs down the main app.

export interface RemoveBgProgress {
  /** 0..1 overall progress, or undefined while assets are still downloading. */
  ratio?: number
  stage: string
}

export async function removeBackground(
  input: Blob,
  onProgress?: (p: RemoveBgProgress) => void
): Promise<Blob> {
  const { removeBackground: imglyRemoveBackground } = await import('@imgly/background-removal')

  return imglyRemoveBackground(input, {
    output: { format: 'image/png' },
    progress: (key, current, total) => {
      const ratio = total > 0 ? current / total : undefined
      const stage = key.startsWith('fetch') ? 'Baixando modelo (só na 1ª vez)…' : 'Removendo o fundo…'
      onProgress?.({ ratio, stage })
    },
  })
}
