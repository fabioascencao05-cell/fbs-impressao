'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type Arte = {
  id: string; metodo: string; status: string; url_final: string | null
  url_original: string; nome_arquivo: string; blur_level: number; turdsize: number; num_cores: number
}

export default function AprovacaoPage({ params }: { params: { id: string } }) {
  const [arte, setArte] = useState<Arte | null>(null)
  const [blurLevel, setBlurLevel] = useState(3)
  const [turdsize, setTurdsize] = useState(2)
  const [reprocessando, setReprocessando] = useState(false)
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const carregar = async () => {
      const { data } = await supabase.from('artes_processadas').select('*').eq('id', params.id).single()
      if (data) {
        setArte(data)
        setBlurLevel(data.blur_level ?? 3)
        setTurdsize(data.turdsize ?? 2)
      }
    }
    carregar()

    // Realtime: atualiza imagem quando url_final mudar (após reprocessamento)
    const canal = supabase.channel(`aprovacao-${params.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'artes_processadas', filter: `id=eq.${params.id}` },
        payload => { setArte(prev => prev ? { ...prev, ...payload.new } : null); setReprocessando(false) })
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [params.id])

  // Debounce: espera 600ms após parar de mover o slider antes de reprocessar
  const dispararReprocessamento = useCallback((blur: number, turd: number) => {
    if (timer) clearTimeout(timer)
    const t = setTimeout(async () => {
      setReprocessando(true)
      await fetch('/api/reprocessar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arte_id: params.id, blur_level: blur, turdsize: turd }),
      })
    }, 600)
    setTimer(t)
  }, [params.id, timer])

  const onBlurChange = (v: number) => { setBlurLevel(v); dispararReprocessamento(v, turdsize) }
  const onTurdsizeChange = (v: number) => { setTurdsize(v); dispararReprocessamento(blurLevel, v) }

  if (!arte) return <div className="shell" style={{ paddingTop: 80 }}><div className="empty">CARREGANDO…</div></div>

  const isSilk = arte.metodo === 'Silk'
  const imgSrc = arte.url_final || arte.url_original

  return (
    <>
      <div className="cmyk-bar"><span /><span /><span /><span /></div>
      <main className="shell">
        <header style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="brand" style={{ fontSize: '1.8rem' }}>APROVAÇÃO<em>.</em></h1>
            <p className="brand-sub">{arte.nome_arquivo} · {arte.metodo}</p>
          </div>
          <a className="nav-link" href="/dashboard">← PAINEL</a>
        </header>

        {/* Preview grande */}
        <div style={{ position: 'relative' }}>
          {reprocessando && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,13,13,.7)', borderRadius: 12, zIndex: 10 }}>
              <span className="badge pulse" style={{ color: 'var(--cyan)', fontSize: '1rem' }}>REPROCESSANDO…</span>
            </div>
          )}
          {imgSrc && (
            arte.status === 'Concluido' && arte.url_final?.endsWith('.svg')
              ? <object data={imgSrc} type="image/svg+xml" className="approval-canvas" style={{ width: '100%', height: '70vh' }} />
              : <img src={imgSrc} alt="Arte processada" className="approval-canvas" />
          )}
        </div>

        {/* Slider — só para Silk */}
        {isSilk && (
          <div style={{ marginTop: 24 }}>
            <div className="slider-wrap">
              <label>
                <span>SUAVIZAÇÃO (bilateral filter) — blur_level</span>
                <span style={{ color: 'var(--cyan)' }}>{blurLevel}</span>
              </label>
              <input type="range" min={1} max={9} step={2} value={blurLevel} onChange={e => onBlurChange(Number(e.target.value))} />
              <div className="drop-hint" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Mais detalhe</span><span>Mais suave</span>
              </div>
            </div>

            <div className="slider-wrap" style={{ marginTop: 12 }}>
              <label>
                <span>LIMPEZA DE PONTOS (turdsize) — ruído mínimo</span>
                <span style={{ color: 'var(--cyan)' }}>{turdsize} px²</span>
              </label>
              <input type="range" min={1} max={10} step={1} value={turdsize} onChange={e => onTurdsizeChange(Number(e.target.value))} />
              <div className="drop-hint" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Preservar detalhes</span><span>Remover manchas</span>
              </div>
            </div>

            <div className="drop-hint" style={{ marginTop: 8 }}>
              ↑ Mova os sliders para ajustar. Imagem atualiza automaticamente após 600ms.
            </div>
          </div>
        )}

        {/* Botão download */}
        {arte.url_final && (
          <a href={arte.url_final} download style={{ display: 'block', textDecoration: 'none', marginTop: 24 }}>
            <button className={`btn-primary${arte.metodo === 'DTF' ? ' magenta' : ''}`} style={{ width: '100%' }}>
              ↓ BAIXAR ARTE FINAL ({arte.metodo === 'Silk' ? 'SVG' : 'PNG 300 DPI'})
            </button>
          </a>
        )}

        {arte.status === 'Processando' && (
          <div className="empty" style={{ padding: '32px 0' }}>
            <span className="badge pulse" style={{ color: 'var(--busy)', fontSize: '.85rem' }}>PROCESSANDO — aguarde…</span>
          </div>
        )}
      </main>
    </>
  )
}
