// Frontend client for the premium (paid) AI tools, which run on Replicate via
// the secure `replicate-ai` Supabase Edge Function. The Replicate API token is
// never in the browser — the function holds it as a secret.

import { supabase } from '@/lib/supabaseClient'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    reader.readAsDataURL(blob)
  })
}

async function invoke(body: Record<string, unknown>): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('replicate-ai', { body })

  if (error) {
    // The function returns a JSON { error } body on failure — surface its message.
    let message = error.message || 'Falha na IA.'
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        const parsed = await ctx.json()
        if (parsed?.error) message = parsed.error
      }
    } catch {
      /* keep default message */
    }
    throw new Error(message)
  }

  if (data instanceof Blob) {
    // A JSON blob here means the function reported an error with a 2xx-ish shape.
    if (data.type.includes('application/json')) {
      const parsed = JSON.parse(await data.text())
      throw new Error(parsed?.error || 'Falha na IA.')
    }
    return data
  }

  throw new Error('Resposta inesperada da IA.')
}

/** Premium background removal (Replicate BiRefNet). */
export async function aiRemoveBackground(image: Blob): Promise<Blob> {
  return invoke({ op: 'remove-bg', image: await blobToDataUrl(image) })
}

/** Premium real super-resolution (Replicate Real-ESRGAN). */
export async function aiUpscale(image: Blob, scale = 4): Promise<Blob> {
  return invoke({ op: 'upscale', image: await blobToDataUrl(image), scale })
}

/** Premium restore for blurry/low-quality images (Replicate CodeFormer). */
export async function aiRestore(image: Blob): Promise<Blob> {
  return invoke({ op: 'restore', image: await blobToDataUrl(image) })
}

/** Generate new artwork from a text prompt (Replicate FLUX). */
export async function aiGenerate(prompt: string): Promise<Blob> {
  return invoke({ op: 'generate', prompt })
}
