// Supabase Edge Function — secure proxy to Replicate.
//
// The Replicate API token lives ONLY here, as the `REPLICATE_API_TOKEN`
// secret (never in the frontend/browser). The Studio calls this function via
// `supabase.functions.invoke('replicate-ai', ...)`; because JWT verification is
// on, only logged-in users can spend your Replicate credits.
//
// Each `op` maps to a Replicate model. Swap the model slugs below if you prefer
// others — the models endpoint always runs the model's latest version.

const REPLICATE_API = 'https://api.replicate.com/v1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Params = Record<string, unknown>

interface OpConfig {
  model: string
  buildInput: (p: Params) => Params
}

const OPS: Record<string, OpConfig> = {
  // Background removal (BiRefNet) — high quality edges/hair.
  'remove-bg': {
    model: 'men1scus/birefnet',
    buildInput: (p) => ({ image: p.image }),
  },
  // Real super-resolution.
  upscale: {
    model: 'nightmareai/real-esrgan',
    buildInput: (p) => ({ image: p.image, scale: Number(p.scale) || 4, face_enhance: false }),
  },
  // Restore blurry/low-quality photos (and faces).
  restore: {
    model: 'sczhou/codeformer',
    buildInput: (p) => ({
      image: p.image,
      upscale: 2,
      face_upsample: true,
      background_enhance: true,
      codeformer_fidelity: 0.7,
    }),
  },
  // Generate artwork from a text description.
  generate: {
    model: 'black-forest-labs/flux-schnell',
    buildInput: (p) => ({
      prompt: p.prompt,
      aspect_ratio: (p.aspect_ratio as string) || '1:1',
      output_format: 'png',
      num_outputs: 1,
    }),
  },
}

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const token = Deno.env.get('REPLICATE_API_TOKEN')
    if (!token) {
      return jsonResponse(
        { error: 'A chave do Replicate ainda não foi configurada no Supabase (REPLICATE_API_TOKEN).' },
        400
      )
    }

    const body = (await req.json()) as Params
    const config = OPS[String(body.op)]
    if (!config) return jsonResponse({ error: 'Operação de IA inválida.' }, 400)

    const model = (body.model as string) || config.model

    // Create the prediction and block until it finishes (Prefer: wait, ~60s).
    const createRes = await fetch(`${REPLICATE_API}/models/${model}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({ input: config.buildInput(body) }),
    })

    let prediction = await createRes.json()
    if (!createRes.ok) {
      return jsonResponse({ error: prediction?.detail || 'Erro na chamada ao Replicate.' }, 502)
    }

    // If it didn't finish inside the wait window, poll until done.
    let tries = 0
    while ((prediction.status === 'starting' || prediction.status === 'processing') && tries < 60) {
      await new Promise((r) => setTimeout(r, 1500))
      const pollRes = await fetch(`${REPLICATE_API}/predictions/${prediction.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      prediction = await pollRes.json()
      tries++
    }

    if (prediction.status !== 'succeeded') {
      return jsonResponse({ error: `A IA não concluiu: ${prediction.error || prediction.status}` }, 502)
    }

    const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
    if (!output || typeof output !== 'string') {
      return jsonResponse({ error: 'A IA não retornou imagem.' }, 502)
    }

    // Fetch the resulting image and stream the bytes back, so the browser gets a
    // ready-to-use Blob (no cross-origin fetch of Replicate URLs needed).
    const imgRes = await fetch(output)
    const buffer = await imgRes.arrayBuffer()
    return new Response(buffer, {
      headers: { ...cors, 'Content-Type': imgRes.headers.get('content-type') || 'image/png' },
    })
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Erro inesperado na função de IA.' }, 500)
  }
})
