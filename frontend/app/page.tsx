'use client'
import { useState, useRef, useCallback } from 'react'
import { supabase, BUCKET_ENTRADA } from '@/lib/supabase'

type Metodo = 'Silk' | 'DTF'

const FORMATOS = ['image/png', 'image/jpeg', 'image/tiff']
const MAX_MB = 50

export default function Home() {
  const [metodo, setMetodo] = useState<Metodo>('Silk')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [prazo, setPrazo] = useState('')
  const [numCores, setNumCores] = useState(4)
  const [over, setOver] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const mostrarToast = (msg: string, tipo: 'ok' | 'err') => {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 4000)
  }

  const validar = (f: File) => {
    if (!FORMATOS.includes(f.type)) { mostrarToast('Formato inválido. Use PNG, JPG ou TIFF.', 'err'); return false }
    if (f.size > MAX_MB * 1024 * 1024) { mostrarToast(`Arquivo muito grande. Máximo ${MAX_MB}MB.`, 'err'); return false }
    return true
  }

  const onFile = (f: File) => { if (validar(f)) setArquivo(f) }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }, [])

  const handleSubmit = async () => {
    if (!arquivo || !prazo) return mostrarToast('Selecione arquivo e prazo.', 'err')
    setEnviando(true)
    try {
      // 1. Upload direto do browser → Supabase Storage
      const nomeArquivo = `${Date.now()}_${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET_ENTRADA)
        .upload(nomeArquivo, arquivo, { contentType: arquivo.type, upsert: false })

      if (uploadErr) throw new Error(`Upload falhou: ${uploadErr.message}`)

      const urlOriginal = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_ENTRADA}/${encodeURIComponent(nomeArquivo)}`

      // 2. API route insere no banco + dispara webhook (fire-and-forget)
      const resp = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metodo, prazo_entrega: prazo, url_original: urlOriginal, nome_arquivo: arquivo.name, num_cores: numCores }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.erro || 'Erro ao registrar')
      }

      mostrarToast('Arte enviada! Acompanhe no painel.', 'ok')
      setArquivo(null)
      setPrazo('')
    } catch (e: any) {
      mostrarToast(e.message || 'Erro inesperado', 'err')
    } finally {
      setEnviando(false)
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
        <header style={{ marginBottom: 36 }}>
          <h1 className="brand rise">FBS<em>.</em>VETOR</h1>
          <p className="brand-sub">Pré-impressão automática · Silk &amp; DTF</p>
        </header>

        <div className="spec-strip rise" style={{ animationDelay: '.05s' }}>
          <span>SILK SCREEN</span><span>DTF ALTA QUALIDADE</span><span>IA EMBARCADA</span><span>SVG EM CAMADAS</span>
        </div>

        {/* Método */}
        <div className="method-grid rise" style={{ animationDelay: '.1s' }}>
          {(['Silk', 'DTF'] as Metodo[]).map(m => (
            <div key={m} className={`method-card${metodo === m ? ' active' + (m === 'DTF' ? ' dtf' : '') : ''}`} onClick={() => setMetodo(m)}>
              <div className="method-title">{m === 'Silk' ? '🎨 Silk Screen' : '🖨️ DTF Alta Qualidade'}</div>
              <div className="method-desc">
                {m === 'Silk' ? 'Separação de cores · Vetorização SVG por camada · Parâmetros ajustáveis' : 'Upscale 4x Real-ESRGAN · Remoção de fundo com IA · PNG 300 DPI transparente'}
              </div>
            </div>
          ))}
        </div>

        {/* Drop Zone */}
        <div
          className={`drop-zone rise${over ? ' over' : ''}`}
          style={{ animationDelay: '.15s' }}
          onDragOver={e => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".png,.jpg,.jpeg,.tiff,.tif" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
          {arquivo ? (
            <div>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 700 }}>{arquivo.name}</div>
              <div className="drop-hint">{(arquivo.size / 1024 / 1024).toFixed(2)} MB · Clique para trocar</div>
            </div>
          ) : (
            <>
              <div className="drop-icon">📂</div>
              <div style={{ fontWeight: 700 }}>Arraste a arte aqui ou clique</div>
              <div className="drop-hint">PNG · JPG · TIFF · Máximo 50MB</div>
            </>
          )}
        </div>

        {/* Campos */}
        <div className="form-row rise" style={{ animationDelay: '.2s' }}>
          <div className="field">
            <label>Prazo de entrega *</label>
            <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} min={new Date().toISOString().split('T')[0]} />
          </div>
          {metodo === 'Silk' && (
            <div className="field">
              <label>Número de cores</label>
              <select value={numCores} onChange={e => setNumCores(Number(e.target.value))}>
                {[2, 3, 4, 5, 6, 8].map(n => <option key={n} value={n}>{n} cores</option>)}
              </select>
            </div>
          )}
        </div>

        <button className={`btn-primary rise${metodo === 'DTF' ? ' magenta' : ''}`} style={{ animationDelay: '.25s' }} disabled={enviando || !arquivo || !prazo} onClick={handleSubmit}>
          {enviando ? '⏳ ENVIANDO…' : `▶ PROCESSAR — ${metodo === 'Silk' ? 'SILK SCREEN' : 'DTF ALTA QUALIDADE'}`}
        </button>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a className="nav-link" href="/dashboard">Ver painel de produção →</a>
        </div>
      </main>

      {toast && <div className={`toast ${toast.tipo}`}>{toast.msg}</div>}
    </>
  )
}
