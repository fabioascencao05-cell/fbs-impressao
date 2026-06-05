'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type WsEvent =
  | { type: 'start';    message: string }
  | { type: 'progress'; message: string; percent: number }
  | { type: 'preview';  image: string;   label: string }
  | { type: 'layer';    image: string;   label: string; index: number; total: number; color: string }
  | { type: 'done';     url_final: string; message: string; score?: number }
  | { type: 'error';    message: string }

type Arte = {
  id: string; metodo: string; status: string; url_final: string | null
  url_original: string; nome_arquivo: string; blur_level: number; turdsize: number; num_cores: number
}

export default function AprovacaoPage({ params }: { params: { id: string } }) {
  const [arte, setArte]             = useState<Arte | null>(null)
  const [eventos, setEventos]       = useState<WsEvent[]>([])
  const [liveImage, setLiveImage]   = useState<string | null>(null)
  const [layers, setLayers]         = useState<{ image: string; label: string; color: string }[]>([])
  const [percent, setPercent]       = useState(0)
  const [statusMsg, setStatusMsg]   = useState('Conectando ao servidor…')
  const [isDone, setIsDone]         = useState(false)
  const [urlFinal, setUrlFinal]     = useState<string | null>(null)
  const [wsStatus, setWsStatus]     = useState<'connecting' | 'open' | 'closed'>('connecting')
  const [blurLevel, setBlurLevel]   = useState(3)
  const [turdsize, setTurdsize]     = useState(2)
  const [reprocessando, setReproc]  = useState(false)
  const sliderTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logRef      = useRef<HTMLDivElement>(null)

  /* Carrega arte */
  useEffect(() => {
    supabase.from('artes_processadas').select('*').eq('id', params.id).single()
      .then(({ data }) => {
        if (!data) return
        setArte(data)
        setBlurLevel(data.blur_level ?? 3)
        setTurdsize(data.turdsize ?? 2)
        if (data.status === 'Concluido' || data.status === 'Revisao_Manual') {
          setIsDone(true); setUrlFinal(data.url_final)
          setPercent(100); setStatusMsg('Processamento concluído.')
          setWsStatus('closed')
        }
      })
  }, [params.id])

  /* WebSocket (com proteção mixed content) */
  useEffect(() => {
    if (isDone) return

    const base = process.env.NEXT_PUBLIC_VPS_WS_URL || 'ws://147.15.11.61:8000'
    let ws: WebSocket | null = null

    // Detecta mixed content: página HTTPS + WS inseguro = browser bloqueia.
    // Construtor lança SecurityError síncrono → quebra a página. Pula antes.
    const pageIsHttps  = typeof window !== 'undefined' && window.location.protocol === 'https:'
    const wsIsInsecure = base.startsWith('ws://')

    if (pageIsHttps && wsIsInsecure) {
      setWsStatus('closed')
      setStatusMsg('🟡 Streaming ao vivo indisponível (HTTPS→WS bloqueado). Usando Realtime…')
    } else {
      try {
        ws = new WebSocket(`${base}/ws/process/${params.id}`)
        setWsStatus('connecting')

        ws.onopen  = () => { setWsStatus('open'); setStatusMsg('🟢 Conectado — aguardando pipeline…') }
        ws.onerror = () => setStatusMsg('⚠️ WS falhou. Usando Realtime como fallback…')
        ws.onclose = () => setWsStatus('closed')

        ws.onmessage = (ev) => {
          let data: WsEvent
          try { data = JSON.parse(ev.data) } catch { return }
          setEventos(prev => [...prev, data])

          if (data.type === 'start')    { setStatusMsg(data.message); setPercent(2) }
          if (data.type === 'progress') { setStatusMsg(data.message); setPercent(data.percent) }
          if (data.type === 'preview')  { setLiveImage(`data:image/jpeg;base64,${data.image}`); setStatusMsg(data.label) }
          if (data.type === 'layer') {
            const src = `data:image/jpeg;base64,${data.image}`
            setLiveImage(src)
            setLayers(prev => [...prev, { image: src, label: data.label, color: data.color }])
            setStatusMsg(data.label)
            setPercent(Math.round((data.index / data.total) * 50 + 40))
          }
          if (data.type === 'done')  { setIsDone(true); setUrlFinal(data.url_final); setPercent(100); setStatusMsg(data.message); ws?.close() }
          if (data.type === 'error') { setStatusMsg(`❌ ${data.message}`); setPercent(0); ws?.close() }
        }
      } catch (e) {
        console.error('[WS] construtor falhou:', e)
        setWsStatus('closed')
        setStatusMsg('🟡 WS não pôde abrir. Aguardando atualização via Realtime…')
      }
    }

    /* Realtime fallback — funciona sempre, com ou sem WS */
    const canal = supabase.channel(`live-${params.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'artes_processadas', filter: `id=eq.${params.id}` },
        ({ new: n }) => {
          if (n.status === 'Concluido' || n.status === 'Revisao_Manual') {
            setIsDone(true); setUrlFinal(n.url_final); setPercent(100)
            setStatusMsg('✅ Concluído (via Realtime).')
          } else if (n.status === 'Erro' || n.status === 'Erro (Timeout)' || n.status === 'Cancelado') {
            setStatusMsg(`❌ ${n.status}: ${n.erro_mensagem || 'sem detalhes'}`)
          }
        }).subscribe()

    return () => {
      try { ws?.close() } catch {}
      supabase.removeChannel(canal)
    }
  }, [params.id, isDone])

  /* Auto-scroll log */
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [eventos])

  /* Slider debounce */
  const dispararReprocessamento = useCallback((blur: number, turd: number) => {
    if (sliderTimer.current) clearTimeout(sliderTimer.current)
    sliderTimer.current = setTimeout(async () => {
      setReproc(true); setIsDone(false); setLiveImage(null); setLayers([])
      setPercent(0); setStatusMsg('Reprocessando com novos parâmetros…')
      await fetch('/api/reprocessar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arte_id: params.id, blur_level: blur, turdsize: turd }),
      })
      setReproc(false)
    }, 600)
  }, [params.id])

  const onBlurChange = (v: number) => { setBlurLevel(v); dispararReprocessamento(v, turdsize) }
  const onTurdChange = (v: number) => { setTurdsize(v);  dispararReprocessamento(blurLevel, v) }

  if (!arte) return (
    <div className="shell" style={{ paddingTop: 80 }}>
      <div className="empty"><span className="badge pulse" style={{ color: 'var(--cyan)' }}>CARREGANDO…</span></div>
    </div>
  )

  const isSilk = arte.metodo === 'Silk'

  return (
    <>
      <div className="cmyk-bar"><span /><span /><span /><span /></div>
      <main className="shell">

        {/* Header */}
        <header style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="brand" style={{ fontSize: '1.6rem' }}>
              {isDone ? 'ARTE' : 'AO'}<em>.</em>{isDone ? 'PRONTA' : 'VIVO'}
            </h1>
            <p className="brand-sub">{arte.nome_arquivo} · {arte.metodo}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '.65rem', fontFamily: 'JetBrains Mono', opacity: .4, marginBottom: 4 }}>
              WS {wsStatus === 'open' ? '🟢' : wsStatus === 'connecting' ? '🟡' : '⚫'}
            </div>
            <a className="nav-link" href="/dashboard">← PAINEL</a>
          </div>
        </header>

        {/* Barra de progresso */}
        <div style={{ background: 'rgba(245,240,232,.08)', borderRadius: 6, height: 6, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${percent}%`,
            background: isSilk ? 'var(--cyan)' : 'var(--magenta)',
            transition: 'width .4s ease', borderRadius: 6
          }} />
        </div>
        <div style={{ fontSize: '.75rem', fontFamily: 'JetBrains Mono', opacity: .6, marginBottom: 16, minHeight: 20 }}>
          {statusMsg}
        </div>

        {/* Preview ao vivo */}
        {liveImage ? (
          <div style={{ position: 'relative', marginBottom: 16 }}>
            {reprocessando && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,13,13,.75)', borderRadius: 12, zIndex: 10 }}>
                <span className="badge pulse" style={{ color: 'var(--cyan)', fontSize: '1rem' }}>REPROCESSANDO…</span>
              </div>
            )}
            <img src={liveImage} alt="Preview ao vivo" className="approval-canvas" />
          </div>
        ) : (
          <div className="approval-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280 }}>
            <span className="badge pulse" style={{ color: isSilk ? 'var(--cyan)' : 'var(--magenta)', fontSize: '.85rem' }}>
              ⏳ Aguardando pipeline…
            </span>
          </div>
        )}

        {/* Camadas Silk */}
        {isSilk && layers.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '.65rem', fontFamily: 'JetBrains Mono', opacity: .4, marginBottom: 8, letterSpacing: '.1em' }}>
              CAMADAS AO VIVO ({layers.length})
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {layers.map((l, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <img src={l.image} alt={l.label} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: `2px solid ${l.color}` }} />
                  <div style={{ fontSize: '.55rem', fontFamily: 'JetBrains Mono', marginTop: 4, color: l.color }}>{l.color}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Slider — Silk concluído */}
        {isSilk && isDone && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '.65rem', fontFamily: 'JetBrains Mono', opacity: .4, marginBottom: 12, letterSpacing: '.1em' }}>AJUSTE DE DETALHES</div>
            <div className="slider-wrap">
              <label><span>SUAVIZAÇÃO (blur_level)</span><span style={{ color: 'var(--cyan)' }}>{blurLevel}</span></label>
              <input type="range" min={1} max={9} step={2} value={blurLevel} onChange={e => onBlurChange(Number(e.target.value))} />
              <div className="drop-hint" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Mais detalhe</span><span>Mais suave</span></div>
            </div>
            <div className="slider-wrap" style={{ marginTop: 12 }}>
              <label><span>LIMPEZA DE PONTOS (turdsize)</span><span style={{ color: 'var(--cyan)' }}>{turdsize} px²</span></label>
              <input type="range" min={1} max={10} step={1} value={turdsize} onChange={e => onTurdChange(Number(e.target.value))} />
              <div className="drop-hint" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Preservar detalhes</span><span>Remover manchas</span></div>
            </div>
            <div className="drop-hint" style={{ marginTop: 6 }}>Slider → reprocessa automaticamente após 600ms · Preview atualiza ao vivo</div>
          </div>
        )}

        {/* Log de eventos */}
        {eventos.length > 0 && (
          <div ref={logRef} style={{
            background: 'rgba(0,0,0,.4)', borderRadius: 8, padding: '10px 14px',
            maxHeight: 160, overflowY: 'auto', marginBottom: 16,
            fontFamily: 'JetBrains Mono', fontSize: '.68rem', lineHeight: 1.7
          }}>
            {eventos.map((ev, i) => (
              <div key={i} style={{ opacity: i === eventos.length - 1 ? 1 : .45 }}>
                {'message' in ev ? ev.message : 'label' in ev ? `📸 ${ev.label}` : ''}
              </div>
            ))}
          </div>
        )}

        {/* Download */}
        {isDone && urlFinal && (
          <a href={urlFinal} download style={{ display: 'block', textDecoration: 'none', marginBottom: 16 }}>
            <button className={`btn-primary${!isSilk ? ' magenta' : ''}`}>
              ↓ BAIXAR ARTE FINAL ({isSilk ? 'SVG' : 'PNG 300 DPI'})
            </button>
          </a>
        )}

        <div style={{ textAlign: 'center' }}>
          <a className="nav-link" href="/">← NOVA ARTE</a>
          <span style={{ margin: '0 12px', opacity: .2 }}>|</span>
          <a className="nav-link" href="/dashboard">PAINEL →</a>
        </div>
      </main>
    </>
  )
}
