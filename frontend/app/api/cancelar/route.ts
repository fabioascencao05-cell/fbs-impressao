import { NextRequest, NextResponse } from 'next/server'

const limpar = (v?: string) => (v || '').replace(/[﻿​‌‍]/g, '').trim()

/**
 * POST /api/cancelar
 * Body: { arte_id: string }
 * Proxy para POST VPS/cancel-task/{arte_id}
 */
export async function POST(req: NextRequest) {
  try {
    const { arte_id } = await req.json()
    if (!arte_id) return NextResponse.json({ erro: 'arte_id obrigatório' }, { status: 400 })

    const vpsUrl    = limpar(process.env.VPS_WEBHOOK_URL)   // ex: http://147.15.11.61:8000/webhook
    const secret    = limpar(process.env.WEBHOOK_SECRET)
    const baseUrl   = vpsUrl.replace('/webhook', '')        // http://147.15.11.61:8000

    if (!baseUrl) return NextResponse.json({ erro: 'VPS_WEBHOOK_URL não configurada' }, { status: 500 })

    const resp = await fetch(`${baseUrl}/cancel-task/${arte_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': secret || '',
      },
    })

    if (!resp.ok) {
      const msg = await resp.text()
      return NextResponse.json({ erro: `VPS retornou ${resp.status}: ${msg.substring(0, 200)}` }, { status: resp.status })
    }

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}
