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

    // Helper para marcar arte como Erro quando o webhook falha
    const marcarErro = async (motivo: string) => {
      try {
        await fetch(`${supabaseUrl}/rest/v1/artes_processadas?id=eq.${arte.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'Erro',
            erro_mensagem: motivo.substring(0, 400),
            atualizado_em: new Date().toISOString(),
          }),
        })
      } catch (e) {
        console.error('[WEBHOOK] Falha ao registrar Erro no banco:', (e as any)?.message)
      }
    }

    // AWAIT no webhook — Vercel serverless ENCERRA o lambda assim que o response
    // é retornado, matando promises pendentes. VPS responde em <500ms (só enfileira),
    // então aguardar não impacta UX e GARANTE entrega.
    if (vpsUrl && arte?.id) {
      const secret  = limpar(process.env.WEBHOOK_SECRET)
      const payload = { id: arte.id, metodo, url_original, num_cores: num_cores || 4 }
      console.log(`[WEBHOOK] Disparando para VPS: ${vpsUrl} | arte_id=${arte.id} | metodo=${metodo} | secret_len=${secret.length}`)

      if (!secret) {
        console.error(`[WEBHOOK] ❌ WEBHOOK_SECRET vazia — arte_id=${arte.id} ficará em Pendente`)
        await marcarErro('WEBHOOK_SECRET não configurada no Vercel — webhook não pode autenticar na VPS.')
      } else {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 8000)  // 8s timeout
          const response = await fetch(vpsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
            body: JSON.stringify(payload),
            signal: controller.signal,
          })
          clearTimeout(timeout)

          if (response.status >= 200 && response.status < 300) {
            console.log(`[WEBHOOK] ✅ VPS aceitou arte_id=${arte.id} | status=${response.status}`)
          } else {
            const errText = await response.text().catch(() => '<sem corpo>')
            console.error(`[WEBHOOK] ❌ VPS retornou ${response.status} para arte_id=${arte.id} | corpo: ${errText.substring(0, 500)}`)
            await marcarErro(`Webhook VPS rejeitou (HTTP ${response.status}): ${errText.substring(0, 200)}`)
          }
        } catch (erro: any) {
          const msg = erro?.name === 'AbortError' ? 'Timeout 8s aguardando VPS' : (erro?.message || String(erro))
          console.error(`[WEBHOOK] ❌ Falha ao chamar VPS (${vpsUrl}) para arte_id=${arte.id}: ${msg}`)
          await marcarErro(`Falha de conexão com VPS: ${msg}`)
        }
      }
    } else if (!vpsUrl) {
      console.warn(`[WEBHOOK] ⚠️ VPS_WEBHOOK_URL não configurada — arte_id=${arte?.id} ficou em Pendente`)
      await marcarErro('VPS_WEBHOOK_URL não configurada no Vercel.')
    }

    // Retorna 200 IMEDIATAMENTE, sem aguardar a VPS
    return NextResponse.json({ sucesso: true, arte_id: arte?.id ?? null })
  } catch (e: any) {
    console.error(`[UPLOAD] Erro inesperado:`, e?.message, '| stack:', e?.stack?.split('\n').slice(0, 3).join(' '))
    return NextResponse.json({ erro: `Erro inesperado: ${e?.message}` }, { status: 500 })
  }
}
