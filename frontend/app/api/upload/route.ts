import { NextRequest, NextResponse } from 'next/server'

const limpar = (v?: string) => (v || '').replace(/[﻿​‌‍]/g, '').trim()

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = limpar(process.env.NEXT_PUBLIC_SUPABASE_URL)
    const serviceKey  = limpar(process.env.SUPABASE_SERVICE_ROLE_KEY) || limpar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const vpsUrl      = limpar(process.env.VPS_WEBHOOK_URL) // ex: http://147.15.11.61:8000/webhook

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ erro: 'Env vars ausentes' }, { status: 500 })
    }

    const { metodo, prazo_entrega, url_original, nome_arquivo, num_cores } = await req.json()

    if (!metodo || !prazo_entrega || !url_original) {
      return NextResponse.json({ erro: 'Campos obrigatórios ausentes' }, { status: 400 })
    }

    // Insert na tabela
    const insertResp = await fetch(`${supabaseUrl}/rest/v1/artes_processadas`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        metodo,
        status: 'Pendente',
        prazo_entrega,
        url_original,
        nome_arquivo: nome_arquivo || 'sem-nome',
        num_cores: num_cores || 4,
      }),
    })

    if (!insertResp.ok) {
      const msg = await insertResp.text()
      return NextResponse.json({ erro: `DB insert falhou (${insertResp.status}): ${msg.substring(0, 200)}` }, { status: 500 })
    }

    const rows = await insertResp.json()
    const arte = Array.isArray(rows) ? rows[0] : rows

    // Fire-and-forget: dispara webhook para VPS SEM await
    // Vercel não bloqueia o response; VPS processa em background
    if (vpsUrl && arte?.id) {
      fetch(vpsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': process.env.WEBHOOK_SECRET || '' },
        body: JSON.stringify({ id: arte.id, metodo, url_original, num_cores: num_cores || 4 }),
      }).catch(() => {/* ignora falha de conexão — VPS pode estar reiniciando */})
    }

    // Retorna 200 IMEDIATAMENTE, sem aguardar a VPS
    return NextResponse.json({ sucesso: true, arte_id: arte?.id ?? null })
  } catch (e: any) {
    return NextResponse.json({ erro: `Erro inesperado: ${e?.message}` }, { status: 500 })
  }
}
