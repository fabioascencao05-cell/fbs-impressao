import { NextRequest, NextResponse } from 'next/server'

const limpar = (v?: string) => (v || '').replace(/[﻿​‌‍]/g, '').trim()

/**
 * POST /api/reprocessar
 * Atualiza blur_level + turdsize no banco e re-dispara processamento Silk.
 * Chamado pelo slider de ajuste na tela de aprovação.
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = limpar(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const serviceKey  = limpar(process.env.SUPABASE_SERVICE_ROLE_KEY) || limpar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const vpsUrl      = limpar(process.env.VPS_WEBHOOK_URL)

    const { arte_id, blur_level, turdsize } = await req.json()
    if (!arte_id) return NextResponse.json({ erro: 'arte_id obrigatório' }, { status: 400 })

    // Atualiza parâmetros e volta status para Processando
    const updateResp = await fetch(`${supabaseUrl}/rest/v1/artes_processadas?id=eq.${arte_id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey!,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ blur_level: blur_level ?? 3, turdsize: turdsize ?? 2, status: 'Processando', url_final: null }),
    })

    if (!updateResp.ok) {
      return NextResponse.json({ erro: 'Falha ao atualizar parâmetros' }, { status: 500 })
    }

    // Re-dispara processamento (fire-and-forget)
    if (vpsUrl) {
      const rows = await updateResp.json()
      const arte = Array.isArray(rows) ? rows[0] : rows
      fetch(`${vpsUrl}/reprocessar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': process.env.WEBHOOK_SECRET || '' },
        body: JSON.stringify({ id: arte_id, metodo: arte?.metodo, url_original: arte?.url_original, blur_level, turdsize, num_cores: arte?.num_cores }),
      }).catch(() => {})
    }

    return NextResponse.json({ sucesso: true })
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message }, { status: 500 })
  }
}
