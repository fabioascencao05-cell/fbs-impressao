'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Arte = {
  id: string; metodo: string; status: string; prazo_entrega: string
  url_final: string | null; nome_arquivo: string; score_confianca: number | null
  erro_mensagem: string | null; num_cores: number
}

const STATUS_COR: Record<string, string> = {
  Pendente:       'var(--warn)',
  Processando:    'var(--busy)',
  Concluido:      'var(--ok)',
  Erro:           'var(--err)',
  'Erro (Timeout)': 'var(--err)',
  Revisao_Manual: 'var(--review)',
  Cancelado:      'var(--paper-dim)',
}
const STATUS_LABEL: Record<string, string> = {
  Pendente:       'NA FILA',
  Processando:    'PROCESSANDO',
  Concluido:      'CONCLUÍDO',
  Erro:           'ERRO',
  'Erro (Timeout)': 'TIMEOUT',
  Revisao_Manual: 'REVISÃO',
  Cancelado:      'CANCELADO',
}

export default function Dashboard() {
  const [artes, setArtes]         = useState<Arte[]>([])
  const [carregando, setCarregando] = useState(true)
  const [cancelando, setCancelando] = useState<Set<string>>(new Set())

  useEffect(() => {
    const carregar = async () => {
      const { data } = await supabase
        .from('artes_processadas')
        .select('*')
        .order('prazo_entrega', { ascending: true }) // ESTRITAMENTE por prazo
      setArtes(data || [])
      setCarregando(false)
    }
    carregar()

    const canal = supabase.channel('artes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'artes_processadas' }, () => carregar())
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [])

  const ativos = artes.filter(a => a.status === 'Pendente' || a.status === 'Processando').length

  const handleCancelar = async (arte: Arte) => {
    if (!confirm(`Cancelar "${arte.nome_arquivo}"? A task será encerrada imediatamente.`)) return
    setCancelando(prev => new Set(prev).add(arte.id))
    try {
      const resp = await fetch('/api/cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arte_id: arte.id }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(`Erro ao cancelar: ${err.erro || resp.status}`)
      }
    } catch {
      alert('Erro de conexão ao cancelar.')
    } finally {
      setCancelando(prev => { const s = new Set(prev); s.delete(arte.id); return s })
    }
  }

  return (
    <>
      <div className="cmyk-bar"><span /><span /><span /><span /></div>
      <div className="reg-mark reg-tl"><i /></div>
      <div className="reg-mark reg-tr"><i /></div>
      <div className="reg-mark reg-bl"><i /></div>
      <div className="reg-mark reg-br"><i /></div>

      <main className="shell">
        <header className="masthead rise">
          <div>
            <h1 className="brand">PAINEL<em>.</em><br />PRODUÇÃO</h1>
            <p className="brand-sub">Ordenado por prazo de entrega</p>
          </div>
          <div className="masthead-meta">
            <div><b>{artes.length}</b> ARTES</div>
            <div><b>{ativos}</b> EM ANDAMENTO</div>
            <div style={{ marginTop: 8 }}><a className="nav-link" href="/">← NOVA ARTE</a></div>
          </div>
        </header>

        <div className="spec-strip rise" style={{ animationDelay: '.05s' }}>
          <span>TEMPO REAL</span><span>SILK / DTF</span><span>PRAZO</span>
        </div>

        {carregando ? (
          <div className="empty">CARREGANDO FILA…</div>
        ) : artes.length === 0 ? (
          <div className="empty rise">
            <div className="empty-mark">○ ○ ○</div>NENHUMA ARTE — ENVIE A PRIMEIRA.
          </div>
        ) : (
          <div className="queue">
            {artes.map((arte, i) => (
              <div className="job rise" key={arte.id} style={{ animationDelay: `${.05 * i}s` }}>
                <div className="job-idx">{String(i + 1).padStart(2, '0')}</div>
                <div>
                  <div className="job-name">{arte.nome_arquivo || 'sem-nome'}</div>
                  <div className="job-meta">
                    <span>{arte.metodo}</span>
                    <span>ENTREGA {new Date(arte.prazo_entrega + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                    {arte.metodo === 'Silk' && <span>{arte.num_cores} CORES</span>}
                    {arte.score_confianca != null && <span>CONF {(arte.score_confianca * 100).toFixed(0)}%</span>}
                  </div>
                  {arte.status === 'Revisao_Manual' && (
                    <div className="job-note" style={{ color: 'var(--review)' }}>⚠ Baixa confiança — verificar antes de produzir.</div>
                  )}
                  {arte.status === 'Erro' && arte.erro_mensagem && (
                    <div className="job-note" style={{ color: 'var(--err)' }}>⚠ {arte.erro_mensagem}</div>
                  )}
                </div>
                <div className="job-right">
                  <span className={`badge${arte.status === 'Processando' ? ' pulse' : ''}`}
                    style={{ color: STATUS_COR[arte.status] || 'var(--paper-dim)' }}>
                    {STATUS_LABEL[arte.status] || arte.status}
                  </span>

                  {/* Cancelar — visível apenas para Pendente e Processando */}
                  {(arte.status === 'Processando' || arte.status === 'Pendente') && (
                    <button
                      onClick={() => handleCancelar(arte)}
                      disabled={cancelando.has(arte.id)}
                      style={{
                        background: 'none', border: '1px solid var(--err)',
                        borderRadius: 6, padding: '3px 10px',
                        color: 'var(--err)', cursor: 'pointer',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '.65rem', fontWeight: 700, letterSpacing: '.06em',
                        opacity: cancelando.has(arte.id) ? .4 : 1,
                      }}>
                      {cancelando.has(arte.id) ? '…' : '✕ CANCELAR'}
                    </button>
                  )}

                  {/* Ajustar detalhe — Silk concluída */}
                  {arte.status === 'Concluido' && arte.metodo === 'Silk' && (
                    <a className="btn-approve" href={`/aprovacao/${arte.id}`}>AJUSTAR DETALHE ↗</a>
                  )}

                  {arte.url_final && (
                    <a className="dl" href={arte.url_final} download>BAIXAR ↓</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  )
}
